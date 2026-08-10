import { describe, expect, it } from "vitest";
import { FREE_TRANSLATION_LIMIT, QUOTA_REACHED } from "../quota.server";
import { isDuplicate, isRlsDenied, handleError } from "../backend-errors";
import { enqueueOutbox, listOutbox, dequeueOutbox, clearOutbox } from "../outbox";

describe("free quota", () => {
  it("keeps the documented free allowance", () => {
    expect(FREE_TRANSLATION_LIMIT).toBe(1000);
    expect(QUOTA_REACHED).toBe("TRANSLATION_QUOTA_REACHED");
  });

  it("is surfaced as a recognisable error code, never a raw DB message", () => {
    expect(handleError("TRANSLATION_ERROR", new Error("crédits épuisés"))).toMatch(/Crédits/);
  });
});

describe("idempotence / DB error classification", () => {
  it("recognises a unique violation (a replayed message insert)", () => {
    expect(isDuplicate({ code: "23505" })).toBe(true);
    expect(isDuplicate(new Error("duplicate key value violates unique constraint"))).toBe(true);
    expect(isDuplicate({ code: "23503" })).toBe(false);
  });

  it("recognises an RLS denial", () => {
    expect(isRlsDenied({ code: "42501" })).toBe(true);
    expect(isRlsDenied(new Error("new row violates row-level security policy"))).toBe(true);
  });

  it("never leaks the technical detail to the UI", () => {
    const message = handleError("MESSAGE_ERROR", new Error("pg: relation messages does not exist"));
    expect(message).not.toMatch(/relation/);
    expect(message).toBe("Le message n'a pas pu être envoyé.");
  });
});

describe("outbox", () => {
  const store = new Map<string, string>();
  // Minimal localStorage stand-in: the outbox must survive a failed send.
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };

  const message = {
    localId: "local-1",
    conversationId: "conv-1",
    text: "bonjour",
    sourceLanguage: "fr",
    createdAt: new Date().toISOString(),
  };

  it("keeps a pending message until it is explicitly dequeued", () => {
    store.clear();
    enqueueOutbox(message);
    expect(listOutbox("conv-1")).toHaveLength(1);
    expect(listOutbox("conv-2")).toHaveLength(0);
    dequeueOutbox("local-1");
    expect(listOutbox("conv-1")).toHaveLength(0);
  });

  it("clears only the requested conversation", () => {
    store.clear();
    enqueueOutbox(message);
    enqueueOutbox({ ...message, localId: "local-2", conversationId: "conv-2" });
    clearOutbox("conv-1");
    expect(listOutbox()).toHaveLength(1);
    expect(listOutbox("conv-2")).toHaveLength(1);
  });
});
