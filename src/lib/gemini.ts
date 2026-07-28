/**
 * Minimal Gemini (Google Generative Language API) client.
 *
 * Uses raw fetch rather than the @google/genai SDK, matching how
 * `meetings/schedule` talks to Google Calendar — keeps the dependency
 * surface flat and avoids pulling an SDK in for one endpoint.
 *
 * Requires GEMINI_API_KEY (from https://aistudio.google.com/apikey).
 * Note this is a plain API key and is NOT the same credential as
 * GOOGLE_CLIENT_ID / AUTH_GOOGLE_ID, which are OAuth client creds.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

export type GeminiTurn = { role: "user" | "assistant"; body: string };

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Add it to .env to enable the AI assistant.");
    this.name = "GeminiNotConfiguredError";
  }
}

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GroundingMetadata = { groundingChunks?: GroundingChunk[]; webSearchQueries?: string[] };

/**
 * Sends a conversation to Gemini and returns the reply text.
 * `history` should be in chronological order and include the newest user turn.
 *
 * Google Search grounding is enabled by default: the model can issue real web
 * searches when it decides the prompt or dashboard context isn't enough
 * (general knowledge, current events, prices, anything outside this app's
 * database). Set `search: false` to disable it for a call (e.g. cheaper/faster
 * paths that only need the dashboard's own data).
 */
export async function generateReply(
  history: GeminiTurn[],
  systemInstruction: string,
  options: { search?: boolean } = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiNotConfiguredError();

  const useSearch = options.search !== false;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: history.map((turn) => ({
        // Gemini calls the assistant role "model"
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.body }],
      })),
      // google_search is Gemini's built-in grounding tool: the model runs real
      // Google searches and cites sources, rather than guessing from training
      // data. Only 2.0+ models support it.
      ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: 0.7,
        // 2.5-series models are "thinking" models: internal reasoning tokens are
        // billed against maxOutputTokens. With a small budget the reasoning eats
        // it all and the visible answer comes back truncated mid-sentence, so we
        // disable thinking (chat latency matters more here) and leave generous
        // headroom for the reply itself.
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`Gemini blocked the prompt (${blockReason}).`);

  const candidate = data?.candidates?.[0];
  const finish = candidate?.finishReason;

  const text = candidate?.content?.parts
    ?.map((p: { text?: string }) => p?.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error(
      finish ? `Gemini returned no text (finishReason: ${finish}).` : "Gemini returned an empty response."
    );
  }

  let final = text;

  // Surface truncation rather than silently handing back a half-sentence.
  if (finish === "MAX_TOKENS") {
    final += "\n\n_(response truncated — hit the output token limit)_";
  }

  // If the model actually used web search, append its sources so the answer
  // is verifiable rather than a bare, uncited claim.
  const grounding: GroundingMetadata | undefined = candidate?.groundingMetadata;
  const sources = (grounding?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri));

  if (sources.length > 0) {
    const seen = new Set<string>();
    const unique = sources.filter((s) => (seen.has(s.uri) ? false : (seen.add(s.uri), true))).slice(0, 5);
    final += `\n\n**Sources:**\n${unique.map((s, i) => `${i + 1}. [${s.title || s.uri}](${s.uri})`).join("\n")}`;
  }

  return final;
}
