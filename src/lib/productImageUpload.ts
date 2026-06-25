import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/id";

const BUCKET = "product-images";

/**
 * Compresses + resizes a picked image and uploads it to the product-images
 * bucket, returning the public URL to store in products.image_url.
 *
 * Compression keeps the upload small; resize caps the longest edge at 1000px.
 * Uses a unique path so replacing an image never clobbers another product's.
 */
export async function uploadProductImage(localUri: string): Promise<string> {
  // Compress + cap width (height auto) before upload.
  const out = await manipulateAsync(localUri, [{ resize: { width: 1000 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error("Could not process the image.");

  const path = `products/${uuidv4()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(out.base64), { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
