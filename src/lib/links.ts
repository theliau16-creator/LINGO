/** Client-safe link helpers (no network, no server import). */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[.,;:)\]]+$/, "") : null;
}
