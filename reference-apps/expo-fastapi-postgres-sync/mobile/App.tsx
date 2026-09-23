import { StatusBar } from "expo-status-bar";
import { useCallback } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";

import { useAuth } from "./src/hooks/useAuth";
import { useTasks } from "./src/hooks/useTasks";
import { LoginScreen } from "./src/screens/LoginScreen";
import { TasksScreen } from "./src/screens/TasksScreen";

export default function App() {
  const { user, checkingSession, signIn, signOut, forceSignOut } = useAuth();

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.loading} testID="app-loading">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.root}>
        {user ? <SignedInApp userId={user.id} userName={user.name} onSignOut={signOut} onForceSignOut={forceSignOut} /> : <LoginScreen onSignIn={signIn} />}
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function SignedInApp({
  userId,
  userName,
  onSignOut,
  onForceSignOut,
}: {
  userId: string;
  userName: string;
  onSignOut: () => Promise<void>;
  onForceSignOut: () => void;
}) {
  const onUnauthenticated = useCallback(() => onForceSignOut(), [onForceSignOut]);
  const { tasks, isOffline, syncing, pendingCount, addTask, setStatus, removeTask, syncNow } = useTasks(userId, onUnauthenticated);

  return (
    <TasksScreen
      userName={userName}
      tasks={tasks}
      isOffline={isOffline}
      syncing={syncing}
      pendingCount={pendingCount}
      onAddTask={addTask}
      onSetStatus={setStatus}
      onRemoveTask={removeTask}
      onSyncNow={syncNow}
      onSignOut={onSignOut}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
