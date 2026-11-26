import type { DraftAnswer } from "@/lib/chat/answer";

export const DEFAULT_OLLAMA_MODEL = "qwen2.5:0.5b";

export type LocalLlmStatus = {
  available: boolean;
  used: boolean;
  model: string;
  mode: "local_llm" | "article_search";
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
    detail: `로컬 LLM 사용 중 (${model}). ${searchHint}`,
  };
}

export function polishIsGrounded(text: string, draft: DraftAnswer): boolean {
  const primary = draft.citations[0];
  if (!primary) return false;
  const evidence = `${draft.answer}\n${primary.docTitle} ${primary.articleNo} ${primary.heading} ${primary.baseDate}`;
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((value) => evidence.includes(value));
}

export function attachCitation(text: string, draft: DraftAnswer): string {
  const primary = draft.citations[0];
  if (!primary) return text;
  const stamp = `출처: ${primary.docTitle} ${primary.articleNo} (기준일 ${primary.baseDate})`;
  if (text.includes(primary.articleNo) && text.includes(primary.baseDate)) return text;
  return `${text.trim()}\n\n${stamp}`;
}

export async function polishWithLocalLlm(
  question: string,
  draft: DraftAnswer,
  model: string,
): Promise<string | null> {
  if (draft.citations.length === 0) return null;
  const primary = draft.citations[0];
  const primaryBlock = draft.answer.split("\n\n")[0] ?? draft.answer;
  const evidence = `${primary.docTitle} ${primary.articleNo} ${primary.heading} (기준일 ${primary.baseDate})\n${primaryBlock}`;
  const response = await ollamaFetch(
    "/api/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: { num_ctx: 2048, num_predict: 256, temperature: 0.1 },
        messages: [
          {
            role: "system",
            content:
              "너는 사내 규정 안내 도우미다. 사용자가 준 조문만 근거로 한국어로 짧고 쉽게 답한다. 조문에 없는 숫자·예외·조항을 만들지 않는다. 여러 조문이 있으면 질문 대상에 맞는 것만 쓰고, 다른 대상(연소자 등)의 숫자를 섞지 않는다. 답에 문서 이름, 조항 번호, 기준일을 반드시 넣는다.",
          },
          {
            role: "user",
            content: `질문:\n${question}\n\n근거 조문:\n${evidence}\n\n위 조문만 보고 답하세요.`,
          },
        ],
      }),
    },
    60_000,
  );
  if (!response?.ok) {
    console.error("ollama chat failed", response?.status ?? "no-response");
    return null;
  }
  const payload = (await response.json().catch(() => null)) as {
    message?: { content?: string };
    error?: string;
  } | null;
  const text = payload?.message?.content?.trim() ?? "";
  if (payload?.error) {
    console.error("ollama chat error", payload.error);
    return null;
  }
  if (text.length < 8) {
    console.error("ollama chat empty");
    return null;
  }
  if (!polishIsGrounded(text, draft)) {
    console.error("ollama chat ungrounded");
    return null;
  }
  return attachCitation(text, draft);
}

export function isOllamaRequest(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  return url.includes("127.0.0.1:11434") || url.includes("localhost:11434") || url.includes("[::1]:11434");
}
