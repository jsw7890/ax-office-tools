export const NOT_FOUND_ANSWER = "규정에서 확인되지 않습니다. 관리자에게 문의하세요.";
export const OFF_TOPIC_ANSWER = "규정 질문만 답할 수 있어요.";

export type ProvidedChunk = {
  id: string;
  title: string;
  articleNo: string;
  heading: string;
  content: string;
  baseDate: string;
  sourceUrl: string;
};

export type Citation = {
  chunkId: string;
  docTitle: string;
  articleNo: string;
  heading: string;
  baseDate: string;
  sourceUrl: string;
};

export type DraftAnswer = {
  answer: string;
  citations: Citation[];
  suggestHelpdesk: boolean;
};

const STOP = new Set([
  "사용자", "근로자", "경우", "따라", "또는", "그리고", "한다", "있다", "없다", "아니",
  "하여야", "수", "등", "그", "이", "및", "또는", "대한", "위하여", "에서", "으로",
  "하는", "한", "때", "바", "것", "등", "해당", "포함", "기준", "사항",
]);

const GENERIC_STEMS = new Set([
  "규정", "법률", "법령", "조항", "사항", "기준", "적용", "위반", "경우", "지급",
  "근로", "계약", "사용자", "근로자", "사업", "사업장", "대통령", "고용", "노동",
  "회사", "지원", "다음", "각호", "본문",
]);

const OFF_TOPIC =
  /날씨|맛집|점심\s*메뉴|농담|스포츠|영화|게임|주식|코인|연예|번역해|코드\s*짜|노래|운세/;

const REGULATION_CUE =
  /규정|근로|휴가|연차|임금|급여|월급|봉급|수당|해고|퇴직|휴게|휴일|계약|취업|연장|야간|주휴|징계|출산|산전|산후|휴직|육아|조항|법률|취업규칙|수습|징계|감봉|정직/;

function stem(token: string): string {
  return token.replace(/(으로는|에서|에게|부터|까지|이나|이나요|은|는|이|가|을|를|의|과|와|도|로|에|만)$/u, "");
}

function isGeneric(token: string): boolean {
  const base = stem(token);
  return base.length < 2 || STOP.has(token) || STOP.has(base) || GENERIC_STEMS.has(token) || GENERIC_STEMS.has(base);
}

function tokensOf(text: string): string[] {
  return (text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).filter((token) => !isGeneric(token));
}

function includesTerm(question: string, term: string): boolean {
  if (term.length < 2 || isGeneric(term)) return false;
  let from = 0;
  while (from < question.length) {
    const index = question.indexOf(term, from);
    if (index < 0) return false;
    const previous = index === 0 ? "" : question[index - 1];
    if (!/[가-힣A-Za-z0-9]/.test(previous)) return true;
    from = index + 1;
  }
  return false;
}

function excerpt(content: string): string {
  const compact = content.replace(/\s+\n/g, "\n").trim();
  if (compact.length <= 700) return compact;
  return `${compact.slice(0, 700).trim()}…`;
}

export function answerFromChunks(question: string, chunks: ProvidedChunk[]): DraftAnswer {
  const normalized = question.replace(/\s+/g, " ").trim();
  const questionTokens = new Set(tokensOf(normalized));
  const documents = chunks.map((chunk) => ({
    chunk,
    tokens: new Set(tokensOf(`${chunk.articleNo} ${chunk.heading} ${chunk.content}`)),
  }));
  const frequency = new Map<string, number>();
  for (const document of documents) {
    for (const token of document.tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  const ranked = documents
    .map(({ chunk, tokens }) => {
      let headingScore = 0;
      if (includesTerm(normalized, chunk.articleNo)) headingScore += 10;
      if (includesTerm(normalized, chunk.heading.replace(/\s+/g, ""))) headingScore += 6;
      for (const part of chunk.heading.split(/\s+/)) {
        if (includesTerm(normalized, part)) headingScore += 4;
      }
      let rareHits = 0;
      for (const token of tokens) {
        if (!questionTokens.has(token)) continue;
        const seen = frequency.get(token) ?? documents.length;
        if (seen <= 5) rareHits += 1;
      }
      return { chunk, score: headingScore + rareHits, relevant: headingScore >= 4 || rareHits >= 2 };
    })
    .filter((item) => item.relevant)
    .sort((a, b) => b.score - a.score || a.chunk.articleNo.localeCompare(b.chunk.articleNo, "ko"));

  const best = ranked[0]?.score ?? 0;
  const picked = ranked.filter((item) => item.score >= best - 2).slice(0, 2);
  const regulationQuestion = REGULATION_CUE.test(normalized) || /제\d+조/.test(normalized);

  if (picked.length === 0) {
    if (OFF_TOPIC.test(normalized) && !regulationQuestion) {
      return { answer: OFF_TOPIC_ANSWER, citations: [], suggestHelpdesk: false };
    }
    if (!regulationQuestion) {
      return { answer: OFF_TOPIC_ANSWER, citations: [], suggestHelpdesk: false };
    }
    return { answer: NOT_FOUND_ANSWER, citations: [], suggestHelpdesk: true };
  }

  const citations: Citation[] = picked.map(({ chunk }) => ({
    chunkId: chunk.id,
    docTitle: chunk.title,
    articleNo: chunk.articleNo,
    heading: chunk.heading,
    baseDate: chunk.baseDate,
    sourceUrl: chunk.sourceUrl,
  }));
  const answer = picked
    .map(({ chunk }) => {
      return `${chunk.articleNo}(${chunk.heading})\n${excerpt(chunk.content)}\n출처: ${chunk.title} ${chunk.articleNo} (기준일 ${chunk.baseDate})`;
    })
    .join("\n\n");

  return { answer, citations, suggestHelpdesk: false };
}

export async function refuseUnapprovedModel(): Promise<never> {
  throw new Error("LLM 호출은 사람 승인 전에는 사용할 수 없습니다.");
}
