import { createServerFn } from "@tanstack/react-start";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Optional AI text-polish. AI here touches PRESENTATION ONLY — never a computed
// number. Two server functions live here:
//
//   1. enrichRiskCopyFn        — rewrites the wording of risk/action copy.
//   2. normalizeBusinessProfileFn — tidies the founder's free-text Business
//      Profile fields into clean, consistent display labels (e.g. a messy
//      "below 10k dollar" becomes "< $10k"). It reformats only: it never changes
//      the underlying amounts or converts between currencies, and never invents
//      values for blank fields.
//
// All valuation/score/risk FIGURES are computed deterministically in
// src/lib/analytics.ts from real Shopify data and are never sent here to be
// (re)generated. If no key is set or anything goes wrong, every function below
// returns its input unchanged, so the app works fully without AI.
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

// ---------------------------------------------------------------------------
// Business Profile normalizer.
//
// Takes the founder's free-text profile fields and returns clean, consistent
// display labels (sensible ranges, k/m shorthand, currency words/codes shown as
// their symbol, Title Case, full country names, etc.). It only reformats
// presentation — it does not change the magnitude of any figure, convert
// between currencies, translate/rebrand the business name, or invent values for
// blank fields. Falls back to the (trimmed) input when no key is set or the
// model errors, so saving the profile always works.
// ---------------------------------------------------------------------------

// The free-text fields shown on /profile. Keys mirror BusinessData.
export interface BusinessProfileFields {
  name: string;
  industry: string;
  channel: string;
  country: string;
  age: string;
  monthlyRevenue: string;
  exitTimeframe: string;
}
export interface NormalizeProfileResult {
  normalized: boolean;
  fields: BusinessProfileFields;
}

const PROFILE_KEYS: (keyof BusinessProfileFields)[] = [
  "name",
  "industry",
  "channel",
  "country",
  "age",
  "monthlyRevenue",
  "exitTimeframe",
];

// Trim every field; used as the no-AI / error fallback so we never persist
// raw whitespace and never lose a value the user typed.
function trimProfile(fields: BusinessProfileFields): BusinessProfileFields {
  return PROFILE_KEYS.reduce((acc, key) => {
    acc[key] = (fields[key] ?? "").trim();
    return acc;
  }, {} as BusinessProfileFields);
}

export const normalizeBusinessProfileFn = createServerFn({ method: "POST" })
  .inputValidator((input: BusinessProfileFields) => input)
  .handler(async ({ data }): Promise<NormalizeProfileResult> => {
    const trimmed = trimProfile(data);
    const apiKey = resolveGeminiKey();
    // Nothing to do if there's no key or every field is blank.
    if (!apiKey || PROFILE_KEYS.every((k) => !trimmed[k])) {
      return { normalized: false, fields: trimmed };
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // This is a tiny, mechanical text-tidy, so use the fastest model tier and
      // tightly bound the work: zero temperature (deterministic, no sampling
      // overhead), a small output cap, and native JSON output (no markdown to
      // strip, no retries). All of this minimises round-trip latency on save.
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      });

      const prompt = `You are normalizing a founder's e-commerce Business Profile for display in an M&A dashboard.

Rewrite each field into a clean, consistent, professional display value. Keep each value short — a label, not a sentence.

STRICT RULES:
- DO NOT invent or infer facts. If a field is blank, return it blank ("").
- DO NOT change the magnitude of any figure, and DO NOT convert between currencies (never turn dollars into pounds, etc.). Keep whatever currency the user indicated; if they indicated none, don't add one.

Per-field rules:
- name: trim and fix obvious capitalization only; keep the founder's wording. Never translate or rebrand.
- industry: a concise standard category in Title Case (e.g. "Beauty & Skincare", "Apparel & Fashion", "Electronics", "Home & Garden").
- channel: a Title Case channel/platform name (e.g. "Shopify", "Amazon", "Direct-to-Consumer").
- country: the full official country name in English (e.g. "uk" -> "United Kingdom", "usa" -> "United States").
- age: how long the business has traded, as a number followed by a unit. MUST start with a digit. Examples: "2 years", "2–3 years", "18 months".
- monthlyRevenue: tidy the formatting only. Express the user's currency as its standard SYMBOL placed before the amount — convert a currency word or code to that symbol but keep the SAME currency: dollar/dollars/USD -> "$", pound/pounds/GBP -> "£", euro/euros/EUR -> "€". Use k/m shorthand and clean up ranges. Examples: "below 10k dollar" -> "< $10k"; "around 25000 usd" -> "$25k"; "£25k-50k" -> "£25k–£50k"; "100k+" (no currency given) -> "100k+".
- exitTimeframe: a concise horizon (e.g. "0–6 months", "6–12 months", "12 months", "1–2 years").

Return ONLY a JSON object (no markdown, no prose) with exactly these keys: name, industry, channel, country, age, monthlyRevenue, exitTimeframe.

Input:
${JSON.stringify(trimmed, null, 2)}`;

      const response = await model.generateContent(prompt);
      const text = response.response
        .text()
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(text) as Partial<
        Record<keyof BusinessProfileFields, unknown>
      >;

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { normalized: false, fields: trimmed };
      }

      // Accept a normalized value only when it's a non-empty string; otherwise
      // keep what the user typed. This stops the model from blanking out data.
      const fields = PROFILE_KEYS.reduce((acc, key) => {
        const candidate = parsed[key];
        acc[key] =
          typeof candidate === "string" && candidate.trim()
            ? candidate.trim()
            : trimmed[key];
        return acc;
      }, {} as BusinessProfileFields);

      return { normalized: true, fields };
    } catch (err) {
      console.warn(
        "[AI] Profile normalization failed; saving values as entered:",
        err,
      );
      return { normalized: false, fields: trimmed };
    }
  });
