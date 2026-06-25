import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/id";

const BUCKET = "avatars";

/**
 * Square-crops happen in the picker; here we resize to 512px + compress, then
 * upload to avatars/{user-id}/avatar-{uuid}.jpg and return the public URL.
 */
export async function uploadAvatarImage(userId: string, localUri: string): Promise<string> {
  const out = await manipulateAsync(localUri, [{ resize: { width: 512, height: 512 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error("Could not process the image.");

  const path = `${userId}/avatar-${uuidv4()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(out.base64), { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Best-effort cleanup of a previously uploaded avatar (ignores failures). */
export async function removeAvatarByUrl(url?: string | null): Promise<void> {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return; // not one of ours
  const path = url.slice(idx + marker.length).split("?")[0];
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
