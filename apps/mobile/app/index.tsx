import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/lib/session";

export default function Index() {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }
  return <Redirect href={status === "authed" ? "/(app)" : "/login"} />;
}
