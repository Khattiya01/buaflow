import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { Task, TaskStatus } from "../types";

interface Props {
  userName: string;
  tasks: Task[];
  isOffline: boolean;
  syncing: boolean;
  pendingCount: number;
  onAddTask: (title: string) => Promise<void>;
  onSetStatus: (id: string, status: TaskStatus) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function TasksScreen({
  userName,
  tasks,
  isOffline,
  syncing,
  pendingCount,
  onAddTask,
  onSetStatus,
  onRemoveTask,
  onSyncNow,
  onSignOut,
}: Props) {
  const [title, setTitle] = useState("");

  async function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    await onAddTask(trimmed);
  }

  return (
    <View style={styles.container} testID="tasks-screen">
      <View style={styles.header}>
        <Text testID="welcome-text" style={styles.welcome} accessibilityRole="header">
          Hi, {userName}
        </Text>
        <Pressable testID="logout-button" onPress={onSignOut} accessibilityRole="button" accessibilityLabel="Sign out">
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      {isOffline ? (
        <View testID="offline-banner" style={styles.offlineBanner} accessibilityLiveRegion="polite">
          <Text style={styles.offlineText}>
            Offline — changes are saved on this device and will sync automatically once you're back online.
          </Text>
        </View>
      ) : null}

      <View style={styles.statusRow}>
        <Text testID="pending-count" style={styles.statusText}>
          {pendingCount > 0 ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync` : "All changes synced"}
        </Text>
        <Pressable
          testID="sync-now-button"
          onPress={onSyncNow}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
        >
          <Text style={styles.link}>{syncing ? "Syncing…" : "Sync now"}</Text>
        </Pressable>
      </View>

      <View style={styles.addRow}>
        <TextInput
          testID="new-task-title"
          style={styles.addInput}
          placeholder="Add a task"
          accessibilityLabel="New task title"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable testID="add-task-button" style={styles.addButton} onPress={handleAdd} accessibilityRole="button" accessibilityLabel="Add task">
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        testID="task-list"
        data={tasks}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          <Text testID="empty-state" style={styles.empty}>
            No tasks yet — add one above.
          </Text>
        }
        renderItem={({ item }) => (
          <View testID={`task-${item.id}`} style={styles.taskRow}>
            <Pressable
              testID={`task-toggle-${item.id}`}
              onPress={() => onSetStatus(item.id, NEXT_STATUS[item.status])}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, status ${STATUS_LABEL[item.status]}. Tap to advance status.`}
              style={styles.taskMain}
            >
              <Text style={[styles.taskTitle, item.status === "done" && styles.taskTitleDone]}>{item.title}</Text>
              <Text style={styles.taskStatus}>{STATUS_LABEL[item.status]}</Text>
              {item.dirty ? (
                <Text testID={`task-unsynced-${item.id}`} style={styles.unsyncedBadge}>
                  unsynced
                </Text>
              ) : null}
            </Pressable>
            <Pressable
              testID={`task-delete-${item.id}`}
              onPress={() => onRemoveTask(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.title}`}
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  welcome: { fontSize: 22, fontWeight: "700" },
  link: { color: "#1d4ed8", fontWeight: "600" },
  offlineBanner: { backgroundColor: "#fef3c7", borderRadius: 8, padding: 10, marginBottom: 4 },
  offlineText: { color: "#92400e", fontSize: 13 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  statusText: { fontSize: 12, color: "#6b7280" },
  addRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  addInput: { flex: 1, borderWidth: 1, borderColor: "#9ca3af", borderRadius: 8, padding: 10, fontSize: 16 },
  addButton: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "700" },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 24 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 12,
  },
  taskMain: { flex: 1 },
  taskTitle: { fontSize: 16, fontWeight: "600" },
  taskTitleDone: { textDecorationLine: "line-through", color: "#9ca3af" },
  taskStatus: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  unsyncedBadge: { fontSize: 11, color: "#b45309", marginTop: 2 },
  deleteText: { color: "#b91c1c", fontWeight: "600" },
});
