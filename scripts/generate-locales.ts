/**
 * Build-time generator: translates the French catalogue into the 18 other
 * locales and writes STATIC dictionaries under `src/lib/i18n/locales/generated`.
 *
 * Run with:  bun run scripts/generate-locales.ts [locale ...]
 *
 * The app itself never calls a translation model for its own chrome — the
 * output of this script is committed and shipped as plain TypeScript.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FR } from "../src/lib/i18n/catalog";
import { SUPPORTED_LOCALES } from "../src/lib/i18n/core";

const OUT_DIR = join(import.meta.dir, "..", "src", "lib", "i18n", "locales", "generated");
const MODEL = "google/gemini-2.5-flash";
const CHUNK = 60;

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  de: "German",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  uk: "Ukrainian",
  tr: "Turkish",
  ar: "Arabic",
  he: "Hebrew",
  hi: "Hindi",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  vi: "Vietnamese",
  th: "Thai",
  sv: "Swedish",
};

async function translateChunk(language: string, entries: [string, string][]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is required to generate locales");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: [
            `You localise the UI of Lingo, a premium multilingual messaging app, from French into ${language}.`,
            "Return ONLY a JSON object mapping each input key to its translation.",
            "Keep placeholders like {{name}} untouched. Keep emoji and arrows.",
            "Never translate the brand names: Lingo, Stripe, Apple Pay, Google Pay, PayPal, QR.",
            "Use short, natural, product-quality wording suited to a mobile UI.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(Object.fromEntries(entries)) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI gateway ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(payload.choices[0]!.message.content) as Record<string, string>;
}

function serialise(locale: string, dict: Record<string, string>) {
  const body = Object.entries(dict)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");
  return `import type { Dict } from "../../catalog";\n\n/** Generated locale dictionary (${locale}). Regenerate with scripts/generate-locales.ts. */\nexport const dict: Dict = {\n${body}\n};\n`;
}

async function main() {
  const requested = process.argv.slice(2);
  const locales = (requested.length ? requested : Object.keys(LANGUAGE_NAMES)).filter((code) =>
    (SUPPORTED_LOCALES as readonly string[]).includes(code),
  );
  const entries = Object.entries(FR) as [string, string][];
  mkdirSync(OUT_DIR, { recursive: true });

  for (const locale of locales) {
    const language = LANGUAGE_NAMES[locale]!;
    const dict: Record<string, string> = {};
    for (let index = 0; index < entries.length; index += CHUNK) {
      const slice = entries.slice(index, index + CHUNK);
      let attempt = 0;
      for (;;) {
        try {
          Object.assign(dict, await translateChunk(language, slice));
          break;
        } catch (error) {
          if (++attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
        }
      }
      process.stdout.write(`${locale}: ${Object.keys(dict).length}/${entries.length}\n`);
    }
    // Missing keys stay absent: the runtime falls back to EN then FR.
    const clean = Object.fromEntries(
      entries.filter(([key]) => typeof dict[key] === "string" && dict[key]!.length > 0).map(([key]) => [key, dict[key]!]),
    );
    writeFileSync(join(OUT_DIR, `${locale}.ts`), serialise(locale, clean));
    process.stdout.write(`✓ ${locale} (${Object.keys(clean).length} keys)\n`);
  }
}

void main();
