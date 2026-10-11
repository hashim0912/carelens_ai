import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import jpeg from "jpeg-js";
import { IMAGE_PREPROCESSING } from "@carelens/ml";

const SIZE = IMAGE_PREPROCESSING.resize;

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(input: string): Uint8Array {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64_CHARS.length; i++) {
    lookup[B64_CHARS.charCodeAt(i)] = i;
  }
  let len = input.length;
  while (len > 0 && input[len - 1] === "=") len--;
  const out = new Uint8Array(((len * 3) >> 2) | 0);
  let buffer = 0;
  let bits = 0;
  let p = 0;
  for (let i = 0; i < len; i++) {
    buffer = (buffer << 6) | lookup[input.charCodeAt(i)]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

export async function uriToRgb(uri: string): Promise<Uint8Array> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: SIZE, height: SIZE } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  if (!manipulated.base64) throw new Error("Failed to encode image");

  const decoded = jpeg.decode(base64ToBytes(manipulated.base64), {
    useTArray: true,
  });

  const rgb = new Uint8Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const src = (y * decoded.width + x) * 4;
      const dst = (y * SIZE + x) * 3;
      rgb[dst] = decoded.data[src]!;
      rgb[dst + 1] = decoded.data[src + 1]!;
      rgb[dst + 2] = decoded.data[src + 2]!;
    }
  }
  return rgb;
}
