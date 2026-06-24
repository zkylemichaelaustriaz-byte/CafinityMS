import { useState } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Header } from "@/components/ui/Header";
import {
  KeyboardAwareScrollView,
  useKeyboardAwareScroll,
} from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { updateProfile } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { useAuth } from "@/store/auth";

export default function EditProfileScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const { scrollRef, handleFocus } = useKeyboardAwareScroll();

  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [saving, setSaving] = useState(false);

  const initials =
    `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "☕";
  const email = profile?.email || session?.user.email || "";
  const dirty =
    firstName.trim() !== (profile?.first_name ?? "") ||
    lastName.trim() !== (profile?.last_name ?? "");

  async function save() {
    if (!session) return;
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Name required", "Please enter both your first and last name.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile(session.user.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      await refreshProfile();
      router.back();
    } catch (e) {
      Alert.alert("Could not save", humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Header title="Edit profile" />
      <KeyboardAwareScrollView ref={scrollRef} contentContainerClassName="p-5 pb-40">
        <View className="items-center pb-6">
          <Avatar initials={initials} size={88} />
          <Field
            label="Email"
            value={email}
            editable={false}
            containerClassName="mt-6 w-full opacity-60"
          />
        </View>

        <Field
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          onFocus={handleFocus}
          autoCapitalize="words"
          placeholder="First name"
          returnKeyType="next"
        />
        <Field
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          onFocus={handleFocus}
          autoCapitalize="words"
          placeholder="Last name"
          returnKeyType="done"
        />

        <Button
          label="Save changes"
          onPress={save}
          loading={saving}
          disabled={!dirty}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
