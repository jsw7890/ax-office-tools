import type { Citation, DraftAnswer } from "@/lib/chat/answer";
import { answerIsGrounded, articlesAllowed, containsHangulQuantity, normalizeArticleNo } from "@/lib/chat/grounding";
import { asDateOnly } from "@/lib/time";

export const DEFAULT_OLLAMA_MODEL = "qwen3.5:2b";
export const DEFAULT_EMBED_MODEL = "bge-m3";
export const ANSWER_TIMEOUT_MS = 30_000;
export const ANSWER_NUM_CTX = Number(process.env.ANSWER_NUM_CTX) || 4096;
export const ANSWER_SYSTEM =
  '너는 사내 규정 안내 도우미다. 아래 근거 조문만 보고 판단한다. 반드시 키 answerable, articles, answer만 있는 JSON 한 개만 출력한다. 질문의 답이 조문에 있으면 "answerable":true 와 쉬운 한국어 2~4문장 "answer", 쓴 조문 번호만 "articles"에 넣는다. 근거 조문에 답이 없으면 "answerable":false 이고 "answer"는 "" 이다. 조문에 없는 숫자·예외·조항을 만들지 않는다.';

export type AnswerStageKind = "model" | "reject" | "discard";

export type AnswerStageResult = {
  kind: AnswerStageKind;
  text: string;
  articles: string[];
  elapsedMs: number;
  hangulQuantity: boolean;
  promptEvalCount: number;
};

export type SearchMode = "hybrid" | "keyword";

export type LocalLlmStatus = {
  available: boolean;
  used: boolean;
  model: string;
  mode: "local_llm" | "article_search" | "hybrid";
  searchMode?: SearchMode;
  detail: string;
};

function loopbackOrigin(): string | null {
  const raw = process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
  try {
    const url = new URL(raw);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function localLlmConfigured(): boolean {
  const provider = (process.env.LLM_PROVIDER ?? "ollama").trim().toLowerCase();
  return provider === "ollama" || provider === "local" || provider === "";
}

export function localLlmModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function ollamaFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const origin = loopbackOrigin();
  if (!origin) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${origin}${path}`, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function modelMatches(listed: string, wanted: string): boolean {
  return listed === wanted || listed.startsWith(`${wanted}-`) || listed.startsWith(`${wanted}@`);
}

export async function probeLocalLlm(): Promise<LocalLlmStatus> {
  const model = localLlmModel();
  const searchHint = "꺼져 있으면 조문 검색으로 답합니다.";
  if (!localLlmConfigured()) {
    return {
      available: false,
      used: false,
      model,
      mode: "article_search",
      detail: `로컬 LLM 꺼짐 · ${searchHint}`,
    };
  }
  if (!loopbackOrigin()) {
    return {
      available: false,
      used: false,
      model,
      mode: "article_search",
      detail: `로컬 LLM 꺼짐 · ${searchHint}`,
    };
  }
  const tags = await ollamaFetch("/api/tags", { method: "GET" }, 1500);
  if (!tags?.ok) {
    return {
      available: false,
      used: false,
      model,
      mode: "article_search",
      detail: `로컬 LLM 꺼짐 · ${searchHint}`,
    };
  }
  const body = (await tags.json().catch(() => null)) as { models?: { name?: string }[] } | null;
  const names = (body?.models ?? []).map((item) => String(item.name ?? ""));
  const hasModel = names.some((name) => modelMatches(name, model));
  if (!hasModel) {
    return {
      available: false,
      used: false,
      model,
      mode: "article_search",
      detail: `로컬 LLM 꺼짐 · ${searchHint}`,
    };
  }
  return {
    available: true,
    used: true,
    model,
    mode: "local_llm",
      detail: `답변 모델 ${model} · 꺼져 있으면 검색 결과로 답합니다.`,
  };
}

export function orderCitationsByArticles(citations: Citation[], articles: string[]): Citation[] {
  if (articles.length === 0) return citations;
  const picked: Citation[] = [];
  const seen = new Set<string>();
  for (const articleNo of articles) {
    const hit = citations.find((item) => item.articleNo === articleNo);
    if (hit && !seen.has(hit.chunkId)) {
      picked.push(hit);
      seen.add(hit.chunkId);
    }
  }
  for (const item of citations) {
    if (!seen.has(item.chunkId)) {
      picked.push(item);
      seen.add(item.chunkId);
    }
  }
  return picked;
}

export function attachCitation(text: string, draft: DraftAnswer, articleNos?: string[]): string {
  const wanted = (articleNos ?? []).filter(Boolean);
  const ordered = orderCitationsByArticles(draft.citations, wanted);
  const used = wanted.length > 0 ? ordered.filter((item) => wanted.includes(item.articleNo)) : ordered.slice(0, 1);
  if (used.length === 0) return text;
  const stamps = used.map(
    (item) => `출처: ${item.docTitle} ${item.articleNo} (기준일 ${asDateOnly(item.baseDate)})`,
  );
  if (stamps.every((stamp) => text.includes(stamp))) return text;
  return `${text.trim()}\n\n${stamps.join("\n")}`;
}

function usesThinkOption(model: string): boolean {
  return model.toLowerCase().includes("qwen3.5");
}

function parseAnswerJson(raw: string): { answerable: boolean; articles: string[]; answer: string } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(trimmed) as { answerable?: unknown; articles?: unknown; answer?: unknown };
  if (typeof parsed.answerable !== "boolean") return null;
  const articles = Array.isArray(parsed.articles)
    ? parsed.articles.map((item) => normalizeArticleNo(String(item ?? ""))).filter(Boolean)
    : [];
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  return { answerable: parsed.answerable, articles, answer };
}

export async function answerWithLocalLlm(
  question: string,
  draft: DraftAnswer,
  evidence: string,
  model: string,
): Promise<AnswerStageResult | null> {
  if (draft.citations.length === 0) return null;
  const allowed = draft.citations.map((item) => item.articleNo);
  const started = Date.now();
  const body: Record<string, unknown> = {
    model,
    stream: false,
    format: "json",
    keep_alive: "10m",
    options: { temperature: 0.1, num_ctx: ANSWER_NUM_CTX, num_predict: 280 },
    messages: [
      { role: "system", content: ANSWER_SYSTEM },
      {
        role: "user",
        content: `질문:\n${question}\n\n근거 조문:\n${evidence}\n\nJSON만 답하세요. 형식: {"answerable":true또는false,"articles":["제N조"],"answer":"..."}`,
      },
    ],
  };
  if (usesThinkOption(model)) body.think = false;
  const response = await ollamaFetch(
    "/api/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    ANSWER_TIMEOUT_MS,
  );
  const elapsedMs = Date.now() - started;
  if (!response?.ok) {
    console.error("ollama chat failed", response?.status ?? "no-response");
    return null;
  }
  const payload = (await response.json().catch(() => null)) as {
    message?: { content?: string };
    error?: string;
    prompt_eval_count?: number;
  } | null;
  const promptEvalCount = Number(payload?.prompt_eval_count ?? 0);
  if (payload?.error) {
    console.error("ollama chat error", payload.error);
    return null;
  }
  const raw = payload?.message?.content?.trim() ?? "";
  let parsed: ReturnType<typeof parseAnswerJson>;
  try {
    parsed = parseAnswerJson(raw);
  } catch {
    console.error("ollama chat json");
    return { kind: "discard", text: draft.answer, articles: [], elapsedMs, hangulQuantity: false, promptEvalCount };
  }
  if (!parsed) {
    return { kind: "discard", text: draft.answer, articles: [], elapsedMs, hangulQuantity: false, promptEvalCount };
  }
  if (!parsed.answerable || !articlesAllowed(parsed.articles, allowed)) {
    return { kind: "reject", text: "", articles: parsed.articles, elapsedMs, hangulQuantity: false, promptEvalCount };
  }
  const hangulQuantity = containsHangulQuantity(parsed.answer);
  if (hangulQuantity) {
    console.error("ollama hangul quantity", parsed.answer.slice(0, 80));
  }
  if (!answerIsGrounded(parsed.answer, evidence) || hangulQuantity) {
    console.error("ollama chat ungrounded");
    return { kind: "discard", text: draft.answer, articles: parsed.articles, elapsedMs, hangulQuantity, promptEvalCount };
  }
  return {
    kind: "model",
    text: attachCitation(parsed.answer, draft, parsed.articles),
    articles: parsed.articles,
    elapsedMs,
    hangulQuantity: false,
    promptEvalCount,
  };
}

export function embedModelName(): string {
  return process.env.EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

export async function embedTexts(model: string, texts: string[], timeoutMs = 60_000): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const provider = (process.env.LLM_PROVIDER ?? "ollama").trim().toLowerCase();
  if (provider === "mock" || provider === "claude") return null;
  const response = await ollamaFetch(
    "/api/embed",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    },
    timeoutMs,
  );
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as { embeddings?: number[][] } | null;
  if (!payload?.embeddings?.length) return null;
  return payload.embeddings;
}

export function isOllamaRequest(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  return url.includes("127.0.0.1:11434") || url.includes("localhost:11434") || url.includes("[::1]:11434");
}
