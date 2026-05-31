import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const translateBatch = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      languageName: z.string(),
      nativeName: z.string(),
      pairs: z.array(z.object({ key: z.string(), value: z.string() })).min(1).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "LOVABLE_API_KEY not configured" };
    }

    const pairs = data.pairs
      .map((p, i) => `${i + 1}. [${p.key}] ${JSON.stringify(p.value)}`)
      .join("\n");

    const prompt = `You are a professional medical equipment terminology translator for a healthcare technology management (HTM) app called BMET SEEKER used by Biomedical Equipment Technicians (BMETs).

Translate the following UI strings from English to ${data.languageName} (${data.nativeName}).

RULES:
- Return ONLY a JSON array of translated strings in the EXACT same order as the input
- Keep medical device names, brand names, acronyms (BMET, HTM, CBET, CRES, CHTM, FDA, MAUDE, GUDID, LOTO, OEM, PM, AI) in their original form
- Keep technical identifiers and model numbers unchanged
- Keep template variables like {{count}} exactly as-is
- Keep shortcodes like [SECTION:key] unchanged
- Use natural, professional medical/technical language appropriate for healthcare professionals
- For RTL languages (Arabic, Hebrew, Persian, Kurdish) use proper RTL text
- Return ONLY the JSON array, no explanation, no markdown, no backticks

Input strings to translate:
${pairs}

Return format: ["translation1", "translation2", ...]`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false as const, error: `Gateway ${res.status}: ${text.slice(0, 300)}` };
      }
      const json = await res.json();
      const content: string = json.choices?.[0]?.message?.content ?? "[]";
      const clean = content.replace(/```json|```/gi, "").trim();
      // Extract JSON array even if wrapped
      const start = clean.indexOf("[");
      const end = clean.lastIndexOf("]");
      const arrStr = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
      const parsed = JSON.parse(arrStr);
      if (!Array.isArray(parsed)) {
        return { ok: false as const, error: "Model did not return a JSON array" };
      }
      return { ok: true as const, translations: parsed as string[] };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });