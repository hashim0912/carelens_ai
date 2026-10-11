import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { UserRole } from "@carelens/shared";
import { api } from "@/lib/api";

const ROLES: UserRole[] = ["ADMIN", "DOCTOR", "STAFF"];

export default function UsersScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("STAFF");

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createUser({ name, email, password, role }),
    onSuccess: async () => {
      setName("");
      setEmail("");
      setPassword("");
      setRole("STAFF");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          placeholderTextColor="#64748b"
          style={styles.input}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#64748b"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          placeholderTextColor="#64748b"
          style={styles.input}
        />
        <View style={styles.chips}>
          {ROLES.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={[styles.chip, r === role && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, r === role && styles.chipTextActive]}
              >
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.addButton, createMutation.isPending && styles.disabled]}
          onPress={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.addText}>Add user</Text>
          )}
        </Pressable>
        {createMutation.error ? (
          <Text style={styles.error}>
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "Failed to create user"}
          </Text>
        ) : null}
      </View>

      {usersQuery.isLoading ? <ActivityIndicator color="#38bdf8" /> : null}
      <FlatList
        data={usersQuery.data?.users ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <View style={styles.userRow}>
            <View>
              <Text style={styles.userName}>{item.name}</Text>
              <Text style={styles.userEmail}>{item.email}</Text>
            </View>
            <Text style={styles.userRole}>{item.role}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  form: { gap: 10 },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    backgroundColor: "#1e293b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#38bdf8" },
  chipText: { color: "#cbd5e1" },
  chipTextActive: { color: "#0f172a", fontWeight: "700" },
  addButton: {
    backgroundColor: "#38bdf8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  disabled: { opacity: 0.6 },
  addText: { color: "#0f172a", fontWeight: "700" },
  error: { color: "#f87171" },
  userRow: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userName: { color: "#f8fafc", fontWeight: "600" },
  userEmail: { color: "#64748b", fontSize: 12 },
  userRole: { color: "#38bdf8", fontSize: 12, fontWeight: "600" },
});
