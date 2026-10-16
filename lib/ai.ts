// The app's one AI client: Google Gemini over REST (no SDK). Three shapes cover every feature:
// aiJson (structured output against a zod schema), aiText (plain text, optionally grounded with Google
// Search) and aiTools (a function-calling loop, used by the copilot). Server-only.
import { z } from "zod";

const KEY = process.env.GEMINI_API_KEY ?? "";
// Heavy writing and judgement vs quick extraction (override per environment if the models change).
export const MODELS = { pro: process.env.GEMINI_MODEL_PRO || "gemini-3.1-pro-preview", flash: process.env.GEMINI_MODEL_FLASH || "gemini-3.5-flash" } as const;
export type Tier = keyof typeof MODELS;

export type Part = { text: string } | { image: string /* base64 JPEG */ } | { pdf: string /* base64 */ };
type GPart = { text?: string; inlineData?: { mimeType: string; data: string }; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: unknown; thoughtSignature?: string; thought?: boolean };
type Content = { role: "user" | "model"; parts: GPart[] };

const toPart = (p: Part): GPart => ("text" in p ? { text: p.text } : "image" in p ? { inlineData: { mimeType: "image/jpeg", data: p.image } } : { inlineData: { mimeType: "application/pdf", data: p.pdf } });

// zod -> the JSON Schema subset Gemini accepts for structured output and tool parameters.
export function schemaOf(s: z.ZodType) {
  const j = z.toJSONSchema(s, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete j.$schema;
  return j;
}

export class AiError extends Error {}

async function call(tier: Tier, body: Record<string, unknown>) {
  if (!KEY) throw new AiError("GEMINI_API_KEY is not set.");
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[tier]}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    // Busy or rate-limited: back off and retry a few times.
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise((ok) => setTimeout(ok, 1500 * 2 ** attempt)); continue; }
    if (!r.ok) throw new AiError(`Gemini ${r.status}: ${d?.error?.message ?? r.statusText}`);
    const cand = d.candidates?.[0];
    if (!cand?.content?.parts) throw new AiError(`Gemini returned no content (${cand?.finishReason ?? d.promptFeedback?.blockReason ?? "unknown"}).`);
    return cand as { content: Content; finishReason: string; groundingMetadata?: { groundingChunks?: { web?: { uri: string; title: string } }[] } };
  }
}
const textOf = (c: Content) => c.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
const sys = (system?: string) => (system ? { systemInstruction: { parts: [{ text: system }] } } : {});

// Structured output: the reply is validated against the schema (one retry if the model drifts).
export async function aiJson<S extends z.ZodType>(o: { tier: Tier; system?: string; prompt?: string; parts?: Part[]; schema: S; maxTokens?: number }): Promise<z.infer<S>> {
  const contents: Content[] = [{ role: "user", parts: (o.parts ?? [{ text: o.prompt ?? "" }]).map(toPart) }];
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await call(o.tier, { ...sys(o.system), contents, generationConfig: { responseMimeType: "application/json", responseJsonSchema: schemaOf(o.schema), maxOutputTokens: o.maxTokens ?? 32000 } });
    if (c.finishReason === "MAX_TOKENS") throw new AiError("The answer was cut off (too long). Try again.");
    last = textOf(c.content);
    try {
      const parsed = o.schema.safeParse(JSON.parse(last));
      if (parsed.success) return parsed.data;
    } catch { /* not JSON: retry */ }
  }
  throw new AiError(`The answer didn't match the expected shape: ${last.slice(0, 160)}`);
}

// Plain text; with search: true it is grounded in Google Search and the sources come back too.
export async function aiText(o: { tier: Tier; system?: string; prompt?: string; parts?: Part[]; search?: boolean; maxTokens?: number }) {
  const c = await call(o.tier, {
    ...sys(o.system), contents: [{ role: "user", parts: (o.parts ?? [{ text: o.prompt ?? "" }]).map(toPart) }],
    ...(o.search ? { tools: [{ googleSearch: {} }] } : {}), generationConfig: { maxOutputTokens: o.maxTokens ?? 16000 },
  });
  const sources = (c.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web ? [`${g.web.title}: ${g.web.uri}`] : []));
  return { text: textOf(c.content), sources };
}

// A tool the model may call: parameters are a zod schema, run() returns what the model sees.
export type AiTool = { name: string; description: string; schema: z.ZodType; run: (input: never) => Promise<unknown> };
export const aiTool = <S extends z.ZodType>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<unknown> }): AiTool => t as unknown as AiTool;

// Function-calling loop: the model answers, calls tools, sees their results, until it replies in text.
export async function aiTools(o: { tier: Tier; system?: string; messages: { role: "user" | "assistant"; parts: Part[] }[]; tools: AiTool[]; maxSteps?: number }) {
  const contents: Content[] = o.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: m.parts.map(toPart) }));
  const decl = [{ functionDeclarations: o.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: schemaOf(t.schema) })) }];
  for (let step = 0; step < (o.maxSteps ?? 20); step++) {
    const c = await call(o.tier, { ...sys(o.system), contents, tools: decl, generationConfig: { maxOutputTokens: 16000 } });
    contents.push(c.content); // keep the model's parts as-is (thought signatures must go back unchanged)
    const calls = c.content.parts.filter((p) => p.functionCall);
    if (!calls.length) return { text: textOf(c.content), steps: step + 1 };
    const results: GPart[] = [];
    for (const p of calls) {
      const tool = o.tools.find((t) => t.name === p.functionCall!.name);
      let result: unknown;
      try {
        const args = tool ? tool.schema.safeParse(p.functionCall!.args ?? {}) : null;
        result = !tool ? { error: `Unknown tool ${p.functionCall!.name}` } : !args?.success ? { error: `Bad arguments: ${args?.error.issues[0]?.message}` } : await tool.run(args.data as never);
      } catch (e) { result = { error: e instanceof Error ? e.message : String(e) }; }
      results.push({ functionResponse: { name: p.functionCall!.name, response: { result } } });
    }
    contents.push({ role: "user", parts: results });
  }
  return { text: "I ran out of steps before finishing. Ask me to continue.", steps: o.maxSteps ?? 20 };
}
