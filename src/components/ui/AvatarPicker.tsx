import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Avatar } from "@/components/ui/Avatar";
import { setMyAvatar } from "@/lib/api";
import { removeAvatarByUrl, uploadAvatarImage } from "@/lib/avatarUpload";
import { humanizeError } from "@/lib/errors";
import { useAuth } from "@/store/auth";

/**
 * Tappable avatar that owns the full upload flow: pick (square crop) → resize +
 * compress → upload to the avatars bucket → set avatar_url → refresh profile →
 * best-effort delete of the previous file. Falls back to default photo / initials.
 */
export function AvatarPicker({ size = 80 }: { size?: number }) {
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [busy, setBusy] = useState(false);

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "☕";
  const uid = session?.user.id;

  async function choose() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to set a profile picture.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0] || !uid) return;

    const previous = profile?.avatar_url ?? null;
    setBusy(true);
    try {
      const url = await uploadAvatarImage(uid, res.assets[0].uri);
      await setMyAvatar(url); // confirm DB update before touching the old file
      await refreshProfile();
      await removeAvatarByUrl(previous);
    } catch (e) {
      Alert.alert("Couldn't update photo", humanizeError(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const previous = profile?.avatar_url ?? null;
    setBusy(true);
    try {
      await setMyAvatar(null);
      await refreshProfile();
      await removeAvatarByUrl(previous);
    } catch (e) {
      Alert.alert("Couldn't remove photo", humanizeError(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function openMenu() {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: "Choose photo", onPress: choose }];
    if (profile?.avatar_url) {
      buttons.push({ text: "Remove photo", style: "destructive", onPress: remove });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile photo", undefined, buttons);
  }

  return (
    <Pressable
      onPress={openMenu}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Change profile photo"
    >
      <Avatar uri={profile?.avatar_url} initials={initials} size={size} />
      <View
        className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-brandPrimary"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="camera" size={13} color="#fff" />
        )}
      </View>
    </Pressable>
  );
}
