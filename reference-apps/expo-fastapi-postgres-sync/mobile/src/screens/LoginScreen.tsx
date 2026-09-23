import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function LoginScreen({ onSignIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await onSignIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container} testID="login-screen">
      <Text style={styles.title} accessibilityRole="header">
        Buaflow Tasks
      </Text>
      <Text style={styles.subtitle}>Sign in to sync your tasks across devices, online or offline.</Text>

      <Text nativeID="login-email-label" style={styles.label}>
        Email
      </Text>
      <TextInput
        testID="login-email"
        style={styles.input}
        placeholder="you@example.com"
        accessibilityLabelledBy="login-email-label"
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <Text nativeID="login-password-label" style={styles.label}>
        Password
      </Text>
      <TextInput
        testID="login-password"
        style={styles.input}
        placeholder="••••••••"
        accessibilityLabelledBy="login-password-label"
        accessibilityLabel="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <Text testID="login-error" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="login-submit"
        style={styles.button}
        onPress={handleSubmit}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff", gap: 8 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#4b5563", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 4 },
  input: { borderWidth: 1, borderColor: "#9ca3af", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#b91c1c", fontWeight: "600" },
});
