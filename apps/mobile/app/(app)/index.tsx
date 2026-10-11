import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { describeClinicalContext, getModelDomain } from "@carelens/ml";

const statusColor: Record<string, string> = {
  PENDING: "#fbbf24",
  PROCESSING: "#38bdf8",
  COMPLETED: "#34d399",
  FAILED: "#f87171",
};

function contextSummary(
  modelId: string,
  clinicalContext: Record<string, unknown> | null | undefined,
): string | null {
  const domain = getModelDomain(modelId);
  if (!domain || !clinicalContext) return null;
  const rows = describeClinicalContext(domain, clinicalContext);
  if (rows.length === 0) return null;
  return rows
    .slice(0, 2)
    .map((r) => `${r.label}: ${r.value}`)
    .join(" · ");
}

export default function DashboardScreen() {
  const { signOut } = useSession();
  const { data, isLoading, error } = useQuery({
    queryKey: ["scans"],
    queryFn: () => api.listScans(),
  });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Link href="/(app)/scan" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryText}>New Scan</Text>
          </Pressable>
        </Link>
        <Link href="/(app)/users" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Users</Text>
          </Pressable>
        </Link>
      </View>

      {data ? (
        <View style={styles.stats}>
          <Stat label="Total" value={data.counts.total} />
          <Stat label="Completed" value={data.counts.completed} />
          <Stat label="Failed" value={data.counts.failed} />
        </View>
      ) : null}

      {isLoading ? <ActivityIndicator color="#38bdf8" /> : null}
      {error ? (
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Failed to load scans"}
        </Text>
      ) : null}

      <FlatList
        data={data?.scans ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No scans yet.</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.scanRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanModel}>{item.modelId}</Text>
              <Text style={styles.scanMeta}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
              {contextSummary(item.modelId, item.clinicalContext) ? (
                <Text style={styles.scanContext}>
                  {contextSummary(item.modelId, item.clinicalContext)}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: statusColor[item.status] ?? "#94a3b8" }}>
              {item.status}
            </Text>
          </View>
        )}
      />

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  row: { flexDirection: "row", gap: 12 },
  primaryButton: {
    flex: 1,
    backgroundColor: "#38bdf8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#0f172a", fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { color: "#f8fafc", fontWeight: "600" },
  stats: { flexDirection: "row", gap: 12, marginTop: 16 },
  stat: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statValue: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  statLabel: { color: "#94a3b8", marginTop: 4, fontSize: 12 },
  scanRow: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scanModel: { color: "#f8fafc", fontWeight: "600" },
  scanMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  scanContext: { color: "#7dd3fc", fontSize: 12, marginTop: 2 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 24 },
  error: { color: "#f87171", marginTop: 12 },
  signOut: { alignItems: "center", paddingVertical: 14 },
  signOutText: { color: "#94a3b8" },
});
