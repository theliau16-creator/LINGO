import * as SecureStore from "expo-secure-store";

/**
 * Supabase session storage adapter for React Native.
 *
 * expo-secure-store caps each key at ~2048 bytes; a Supabase session (access
 * + refresh token + metadata) routinely exceeds that. This adapter splits a
 * value across as many `${key}_0`, `${key}_1`, ... chunks as needed, with a
 * `${key}_chunks` sidecar recording the count.
 */

const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}_${index}`;
}

async function getItem(key: string): Promise<string | null> {
  const chunkCountRaw = await SecureStore.getItemAsync(`${key}_chunks`);
  if (!chunkCountRaw) {
    // Nothing ever chunked under this key — might still hold an unchunked
    // legacy value, or nothing at all.
    return SecureStore.getItemAsync(key);
  }

  const chunkCount = Number(chunkCountRaw);
  const parts: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join("");
}

async function setItem(key: string, value: string): Promise<void> {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
  await SecureStore.setItemAsync(`${key}_chunks`, String(chunks.length));
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

async function removeItem(key: string): Promise<void> {
  const chunkCountRaw = await SecureStore.getItemAsync(`${key}_chunks`);
  if (chunkCountRaw) {
    const chunkCount = Number(chunkCountRaw);
    await Promise.all(
      Array.from({ length: chunkCount }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
    );
    await SecureStore.deleteItemAsync(`${key}_chunks`);
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

export const secureStoreAdapter = { getItem, setItem, removeItem };
