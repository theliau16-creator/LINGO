/**
 * Pure helpers deciding WHICH languages a message must be translated into.
 * Kept out of the server module so the cost rules are unit-testable.
 */

export type ParticipantLanguages = {
  primary_language: string | null;
  secondary_language?: string | null;
};

/**
 * Deduplicated set of target languages for a conversation.
 *
 * Cost control: in a group (3+ readers) only PRIMARY languages are translated.
 * Every member still reads the message in their own language; secondary
 * languages would otherwise multiply the AI calls for no added comprehension.
 * Direct conversations keep the secondary language (useful for learners).
 */
export function collectTargetLanguages(
  profiles: ParticipantLanguages[],
  guestLanguages: (string | null)[] = [],
): Set<string> {
  const readers = profiles.length + guestLanguages.length;
  const includeSecondary = readers <= 2;
  const targets = new Set<string>();

  for (const profile of profiles) {
    if (profile.primary_language) targets.add(profile.primary_language);
    if (includeSecondary && profile.secondary_language) targets.add(profile.secondary_language);
  }
  // Web guests are first-class readers: their language is translated like a member's one.
  for (const language of guestLanguages) if (language) targets.add(language);

  return targets;
}

/** Runs async tasks with a bounded concurrency to cap latency without flooding the AI provider. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}
