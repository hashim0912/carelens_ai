import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/lib/session";

export default function AppLayout() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }
  if (status !== "authed") return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1e293b" },
        headerTintColor: "#f8fafc",
        contentStyle: { backgroundColor: "#0f172a" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Dashboard" }} />
      <Stack.Screen name="scan" options={{ title: "New Scan" }} />
      <Stack.Screen name="users" options={{ title: "Users" }} />
    </Stack>
  );
}
