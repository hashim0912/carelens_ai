/**
 * Resilience helpers for choosing a Groq chat model.
 *
 * Groq retires and renames models over time (e.g. `llama-3.3-70b-versatile`
 * is no longer available), which used to drop the report straight to the
 * deterministic template. These pure helpers let the API try an ordered list
 * of candidate models and, as a last resort, pick any chat-capable model that
 * Groq still reports in its `/v1/models` list.
 */

/**
 * Models that cannot serve chat completions (speech-to-text, TTS, prompt
 * guards). Matched case-insensitively against the model id.
 */
const NON_CHAT_PATTERNS: readonly RegExp[] = [
  /whisper/i,
  /orpheus/i,
  /prompt-guard/i,
  /safeguard/i,
  /(^|[/_-])tts([/_-]|$)/i,
];

/** True when a Groq model id can plausibly serve a chat completion. */
export function isChatModel(id: string): boolean {
  const model = id.trim();
  if (!model) return false;
  return !NON_CHAT_PATTERNS.some((pattern) => pattern.test(model));
}

/** Split a comma/whitespace separated list, trimming and de-duplicating. */
export function parseModelList(value: string | undefined | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[,\s]+/)) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Ordered, de-duplicated candidate list: the primary model first, then any
 * configured fallbacks (in order). Empty/undefined entries are ignored.
 */
export function buildGroqModelCandidates(
  primary: string | undefined | null,
  fallbacks: string | undefined | null,
): string[] {
  return parseModelList(
    [primary ?? "", ...parseModelList(fallbacks)].join(","),
  );
}

/** First entry of `preferred` that is present in `available`, else null. */
export function pickAvailableGroqModel(
  preferred: readonly string[],
  available: readonly string[],
): string | null {
  const set = new Set(available);
  for (const id of preferred) {
    if (set.has(id)) return id;
  }
  return null;
}

/**
 * Chooses a model to try after the configured candidates have failed:
 * the first preferred model Groq still lists, otherwise any other
 * chat-capable model. Already-tried ids are never returned.
 */
export function pickDiscoveredGroqModel(
  preferred: readonly string[],
  available: readonly string[],
  exclude: readonly string[] = [],
): string | null {
  const skip = new Set(exclude);
  const chat = available.filter((id) => !skip.has(id) && isChatModel(id));
  return pickAvailableGroqModel(preferred, chat) ?? chat[0] ?? null;
}
