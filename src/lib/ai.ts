import { createServerFn } from "@tanstack/react-start";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Optional AI copy-polish. This is the ONLY place AI is used, and it touches
// PROSE ONLY — never a number. It takes deterministically-computed risk copy
// and rewrites the wording for clarity/tone. If no key is set or anything goes
// wrong, it returns the original text unchanged. Numbers are computed in
// src/lib/analytics.ts and are never sent here to be (re)generated.
// ---------------------------------------------------------------------------

interface RiskCopy {
  title: string;
  description: string;
  recommendation: string;
}
interface EnrichInput {
  industry: string;
  items: RiskCopy[];
}
export interface EnrichResult {
  enriched: boolean;
  items: { description: string; recommendation: string }[];
}

// Server-only. This runs inside a server function, so the key is read from
// process.env and never exposed to the browser. Do NOT use a VITE_-prefixed
// var here — Vite would inline it into the client bundle and leak the key.
function resolveGeminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

const passthrough = (items: RiskCopy[]): EnrichResult => ({
  enriched: false,
  items: items.map((i) => ({
    description: i.description,
    recommendation: i.recommendation,
  })),
});

export const enrichRiskCopyFn = createServerFn({ method: "POST" })
  .inputValidator((input: EnrichInput) => input)
  .handler(async ({ data }): Promise<EnrichResult> => {
    const apiKey = resolveGeminiKey();
    if (!apiKey || data.items.length === 0) return passthrough(data.items);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are an M&A advisor editing risk copy for a ${data.industry} e-commerce business.
Rewrite ONLY the wording of each item's "description" and "recommendation" for clarity and a confident, concise tone.

STRICT RULES:
- Do NOT change, add, or remove any numbers, percentages, or currency figures — keep every figure exactly as given.
- Keep each description to at most 2 sentences and each recommendation to 1 sentence.
- Do not invent facts beyond what is stated.

Return ONLY a JSON array (no markdown, no prose) of objects with keys "description" and "recommendation", in the same order as the input.

Input:
${JSON.stringify(data.items, null, 2)}`;

      const response = await model.generateContent(prompt);
      const text = response.response
        .text()
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(text) as {
        description?: string;
        recommendation?: string;
      }[];

      if (!Array.isArray(parsed) || parsed.length !== data.items.length) {
        return passthrough(data.items);
      }

      return {
        enriched: true,
        items: data.items.map((orig, i) => ({
          description: parsed[i]?.description?.trim() || orig.description,
          recommendation:
            parsed[i]?.recommendation?.trim() || orig.recommendation,
        })),
      };
    } catch (err) {
      console.warn(
        "[AI] Risk copy enrichment failed; using deterministic text:",
        err,
      );
      return passthrough(data.items);
    }
  });
