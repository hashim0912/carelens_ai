import { Injectable, Logger } from "@nestjs/common";
import {
  buildGroqModelCandidates,
  buildReportPrompt,
  pickDiscoveredGroqModel,
  type ReportPrediction,
} from "@carelens/ml";
import { reportContentSchema, type ReportContent } from "@carelens/shared";

/** Default primary model. Kept off the deprecated `llama-3.3-70b-versatile`. */
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * Fallbacks tried, in order, when the configured model is unavailable or
 * errors. Groq retires models over time, so we never depend on a single id.
 */
const DEFAULT_GROQ_MODEL_FALLBACKS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "allam-2-7b",
].join(",");

export interface GroqReportResult {
  content: ReportContent;
  /** The model id that actually served the request (may differ from the primary). */
  modelId: string;
}

/**
 * Thin client for Groq's OpenAI-compatible chat-completions API.
 *
 * The API key is read from the environment and never leaves the server. The
 * client tries an ordered list of models (`GROQ_MODEL`, then
 * `GROQ_MODEL_FALLBACKS`) and, as a last resort, discovers any chat-capable
 * model Groq still lists. When no key is configured, or every model fails, the
 * caller falls back to the deterministic, label-driven template so a report
 * can always be produced.
 */
@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private readonly apiKey = process.env.GROQ_API_KEY;
  private readonly baseUrl =
    process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
  private readonly timeoutMs = Number(process.env.GROQ_TIMEOUT_MS ?? 20000);

  /** Ordered candidate models; `models[0]` is the configured primary. */
  readonly models: string[] = buildGroqModelCandidates(
    process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    process.env.GROQ_MODEL_FALLBACKS ?? DEFAULT_GROQ_MODEL_FALLBACKS,
  );

  /** Configured primary model id (for display / backwards compatibility). */
  readonly model: string = this.models[0] ?? DEFAULT_GROQ_MODEL;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generates grounded report content using the first Groq model that works.
   * Throws only when every candidate has failed, so the caller can fall back
   * to the deterministic template. The returned content is validated against
   * the shared schema.
   */
  async generateReport(
    domain: "chest" | "brain",
    prediction: ReportPrediction,
    clinicalContext?: Record<string, unknown> | null,
  ): Promise<GroqReportResult> {
    if (!this.apiKey) throw new Error("GROQ_API_KEY is not configured");

    const { system, user } = buildReportPrompt(domain, prediction, clinicalContext);
    const tried = new Set<string>();
    const errors: string[] = [];

    const attempt = async (modelId: string): Promise<GroqReportResult | null> => {
      tried.add(modelId);
      try {
        const content = await this.callChat(modelId, system, user);
        return { content, modelId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${modelId}: ${message}`);
        this.logger.warn(`Groq model "${modelId}" failed; trying next. ${message}`);
        return null;
      }
    };

    for (const modelId of this.models) {
      const result = await attempt(modelId);
      if (result) return result;
    }

    // Every configured model failed. Ask Groq what still exists and try one.
    const discovered = await this.discoverModel(tried);
    if (discovered) {
      const result = await attempt(discovered);
      if (result) return result;
    }

    throw new Error(`All Groq models failed. ${errors.join(" | ")}`);
  }

  /** One chat-completions call against a specific model. Throws on any problem. */
  private async callChat(
    modelId: string,
    system: string,
    user: string,
  ): Promise<ReportContent> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq responded ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq returned an empty response");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Groq returned malformed JSON");
    }

    const parsed = reportContentSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.warn("Groq returned an invalid report shape; trying next model.");
      throw new Error("Groq returned an invalid report shape");
    }
    return parsed.data;
  }

  /**
   * Last-resort model discovery: lists Groq's models and returns a chat-capable
   * one that has not already been tried. Returns null if discovery fails.
   */
  private async discoverModel(tried: Set<string>): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const available = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id));
      const pick = pickDiscoveredGroqModel(this.models, available, [...tried]);
      if (pick) {
        this.logger.warn(
          `Configured Groq models unavailable; discovered fallback "${pick}".`,
        );
      }
      return pick;
    } catch (err) {
      this.logger.warn(`Groq model discovery failed. ${String(err)}`);
      return null;
    }
  }
}
