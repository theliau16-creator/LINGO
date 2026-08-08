/**
 * Local outbox — a message typed offline must never disappear.
 *
 * Pending messages are persisted in localStorage and flushed as soon as the
 * browser reports a connection again (or when the chat screen mounts).
 */

export type PendingMessage = {
  localId: string;
  conversationId: string;
  text: string;
  sourceLanguage: string;
  createdAt: string;
  replyToMessageId?: string;
};

const KEY = "lingo:outbox";

function read(): PendingMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingMessage[]) : [];
  } catch {
    return [];
  }
}

function write(items: PendingMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage full or unavailable — nothing better to do than ignore
  }
}

export function listOutbox(conversationId?: string): PendingMessage[] {
  const items = read();
  return conversationId ? items.filter((item) => item.conversationId === conversationId) : items;
}

export function enqueueOutbox(message: PendingMessage) {
  write([...read(), message]);
}

export function dequeueOutbox(localId: string) {
  write(read().filter((item) => item.localId !== localId));
}

export function clearOutbox(conversationId: string) {
  write(read().filter((item) => item.conversationId !== conversationId));
}
