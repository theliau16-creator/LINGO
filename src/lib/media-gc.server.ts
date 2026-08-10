/**
 * Garbage collection of orphan media.
 *
 * An upload lands in storage BEFORE its message row exists (the client uploads,
 * then calls `sendPhotos`/`sendVoice`). If the send never happens — tab closed,
 * network drop, validation error — the object stays forever.
 *
 * Safety rules, in order of importance:
 * 1. an object younger than the grace delay is NEVER touched (it may be an
 *    upload whose message insert is still in flight),
 * 2. an object referenced by any message attachment or voice row is NEVER
 *    touched, even when the message is soft-deleted,
 * 3. the scan is bounded (batch size) so it can be run repeatedly and safely.
 */

import { MEDIA_BUCKET } from "./media.server";

/** Objects younger than this are considered "still being sent". */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export type OrphanScan = {
  scanned: number;
  orphans: number;
  deleted: number;
  dryRun: boolean;
};

/** True when the object is old enough to be a GC candidate. Pure. */
export function isGcCandidate(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const time = Date.parse(createdAt);
  return Number.isFinite(time) && now - time > ORPHAN_GRACE_MS;
}

/** Paths referenced by a set of messages (attachments) — pure, unit-tested. */
export function referencedPaths(
  rows: { attachments: unknown }[],
  voiceRows: { audio_path: string }[] = [],
): Set<string> {
  const paths = new Set<string>();
  for (const row of rows) {
    const list = Array.isArray(row.attachments) ? row.attachments : [];
    for (const item of list) {
      const path = (item as { path?: unknown })?.path;
      if (typeof path === "string" && path) paths.add(path);
    }
  }
  for (const voice of voiceRows) {
    if (voice.audio_path) paths.add(voice.audio_path);
  }
  return paths;
}

/**
 * Scans one user folder of the media bucket and removes unreferenced objects.
 * `dryRun` reports without deleting — used by the admin screen before acting.
 */
export async function collectOrphanMedia(options?: {
  dryRun?: boolean;
  batch?: number;
}): Promise<OrphanScan> {
  const dryRun = options?.dryRun ?? false;
  const batch = Math.min(options?.batch ?? 200, 500);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: folders } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .list("", { limit: 100 });

  const candidates: string[] = [];
  let scanned = 0;

  for (const folder of folders ?? []) {
    if (candidates.length >= batch) break;
    // Storage "folders" have no metadata; real files do.
    if (folder.metadata) continue;
    const { data: objects } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .list(folder.name, { limit: batch, sortBy: { column: "created_at", order: "asc" } });
    for (const object of objects ?? []) {
      scanned += 1;
      if (!object.metadata) continue;
      if (!isGcCandidate(object.created_at)) continue;
      candidates.push(`${folder.name}/${object.name}`);
      if (candidates.length >= batch) break;
    }
  }

  if (candidates.length === 0) return { scanned, orphans: 0, deleted: 0, dryRun };

  // Referenced by a voice row?
  const { data: voiceRows } = await supabaseAdmin
    .from("voice_messages")
    .select("audio_path")
    .in("audio_path", candidates);

  // Referenced by a message attachment? `attachments` is a jsonb array, so we
  // check containment path by path (bounded by the batch size).
  const referenced = new Set((voiceRows ?? []).map((row) => row.audio_path));
  for (const path of candidates) {
    if (referenced.has(path)) continue;
    const { data: hit } = await supabaseAdmin
      .from("messages")
      .select("id")
      .contains("attachments", [{ path }])
      .limit(1)
      .maybeSingle();
    if (hit) referenced.add(path);
  }

  const orphans = candidates.filter((path) => !referenced.has(path));
  if (dryRun || orphans.length === 0) {
    return { scanned, orphans: orphans.length, deleted: 0, dryRun };
  }

  const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(orphans);
  if (error) {
    console.error("[MEDIA_GC_FAILED]", JSON.stringify({ count: orphans.length }));
    return { scanned, orphans: orphans.length, deleted: 0, dryRun };
  }

  console.warn("[MEDIA_GC]", JSON.stringify({ scanned, deleted: orphans.length }));
  return { scanned, orphans: orphans.length, deleted: orphans.length, dryRun };
}
