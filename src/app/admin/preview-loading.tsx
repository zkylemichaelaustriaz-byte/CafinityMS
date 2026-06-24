import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { AppLoading } from "@/components/ui/AppLoading";

/** Demonstrates the in-app loading screen without touching authentication. */
export default function PreviewLoadingScreen() {
  return (
    <Screen edges={["top"]}>
      <Header title="Loading preview" />
      <AppLoading message="Preview only — does not affect sign-in" />
    </Screen>
  );
}
