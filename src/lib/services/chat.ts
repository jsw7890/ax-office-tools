import { getDb } from "@/lib/bootstrap";
import { refuseUnapprovedModel, type ProvidedChunk } from "@/lib/chat/answer";
import { handleOfficeQuestion } from "@/lib/chat/office";
import { hybridSearch } from "@/lib/chat/search";
import { NOT_FOUND_ANSWER } from "@/lib/chat/answer";
import { buildEvidenceText } from "@/lib/chat/evidence";
import { answerWithLocalLlm, localLlmModel, probeLocalLlm, type LocalLlmStatus } from "@/lib/chat/ollama";
import { AppError, mapDbError } from "@/lib/errors";
import { asDateOnly } from "@/lib/time";
import { requiredText } from "@/lib/validate";

export async function chatLlmStatus(): Promise<LocalLlmStatus> {
  const provider = (process.env.LLM_PROVIDER ?? "ollama").trim().toLowerCase();
  if (provider === "claude" || provider === "mock") {
    return {
      available: false,
      used: false,
      model: provider === "mock" ? localLlmModel() : "",
      mode: "article_search",
      detail: "로컬 LLM 꺼짐 · 꺼져 있으면 조문 검색으로 답합니다.",
    };
  }
  return probeLocalLlm();
}

export async function askQuestion(userId: string, questionInput: unknown) {
  const question = requiredText(questionInput, 500, "질문");
  if (process.env.LLM_PROVIDER === "claude") {
    try {
      await refuseUnapprovedModel();
    } catch {
      throw new AppError(503, "AI 답변은 담당자 승인 후에만 사용할 수 있습니다.", "llm_not_approved");
    }
  }
  const db = await getDb();
  try {
    const profile = await db.withUser(userId, (sql) => sql("select role from profiles where id = auth.uid()"));
    const role = profile[0]?.role === "admin" ? "admin" : "staff";
    const office = await handleOfficeQuestion(userId, question, role);
    if (office) {
      const status = await chatLlmStatus();
      status.mode = "article_search";
      status.used = false;
      status.detail =
        "회의실·IT 업무는 규칙으로 처리합니다(답을 LLM이 다시 쓰지 않습니다). 규정 질문은 조문 검색·로컬 LLM으로 답합니다.";
      const saved = await db.withUser(userId, (sql) =>
        sql(
          `insert into chat_logs (user_id, question, answer, cited_chunk_ids)
           values (auth.uid(), $1, $2, $3::uuid[])
           returning id, created_at`,
          [question, office.answer, "{}"],
        ),
      );
      return {
        id: String(saved[0]?.id),
        question,
        answer: office.answer,
        citations: office.citations,
        suggestHelpdesk: office.suggestHelpdesk,
        pendingActions: office.pendingActions,
        llm: status,
      };
    }
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `select c.id, d.title, c.article_no, c.heading, c.content, d.base_date, d.source_url
         from regulation_chunks c
         join regulation_docs d on d.id = c.doc_id
         order by c.sort_order`,
      ),
    );
    const chunks: ProvidedChunk[] = rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      articleNo: String(row.article_no),
      heading: String(row.heading),
      content: String(row.content),
      baseDate: asDateOnly(row.base_date),
      sourceUrl: String(row.source_url),
    }));
    const { draft, searchMode, questionVector } = await hybridSearch(db, userId, question, chunks);
    const status = await chatLlmStatus();
    status.searchMode = searchMode;
    const searchLabel = searchMode === "hybrid" ? "혼합 검색" : "키워드 검색";
    let answer = draft.answer;
    let suggestHelpdesk = draft.suggestHelpdesk;
    let stage: Awaited<ReturnType<typeof answerWithLocalLlm>> = null;
    if (status.available && draft.citations.length > 0) {
      const evidence = await buildEvidenceText(db, userId, draft.citations, chunks, questionVector);
      stage = await answerWithLocalLlm(question, draft, evidence, status.model);
    }
    if (!stage) {
      status.used = false;
      status.mode = searchMode === "hybrid" ? "hybrid" : "article_search";
      if (status.available && draft.citations.length > 0) {
        status.detail = `답변 모델 ${status.model}이 이번 답을 만들지 못해 ${searchLabel}으로 답했습니다.`;
      } else if (draft.citations.length > 0) {
        status.detail = `${searchLabel}으로 답했습니다. 답변 모델이 꺼져 있으면 검색 결과만 보여 줍니다.`;
      } else {
        status.detail = `${searchLabel}으로 답했습니다.`;
      }
    } else if (stage.kind === "reject") {
      answer = NOT_FOUND_ANSWER;
      suggestHelpdesk = true;
      status.used = true;
      status.mode = "local_llm";
      status.detail = `답변 모델 ${status.model} · ${searchLabel}`;
    } else if (stage.kind === "discard") {
      status.used = false;
      status.mode = searchMode === "hybrid" ? "hybrid" : "article_search";
      status.detail = "모델 답이 조문과 맞지 않아 조문만 보여 줍니다";
    } else {
      answer = stage.text;
      status.used = true;
      status.mode = "local_llm";
      status.detail = `답변 모델 ${status.model} · ${searchLabel}`;
    }
    const cited = draft.citations.map((citation) => citation.chunkId).join(",");
    const saved = await db.withUser(userId, (sql) =>
      sql(
        `insert into chat_logs (user_id, question, answer, cited_chunk_ids)
         values (auth.uid(), $1, $2, $3::uuid[])
         returning id, created_at`,
        [question, answer, `{${cited}}`],
      ),
    );
    return {
      id: String(saved[0]?.id),
      question,
      answer,
      citations: draft.citations,
      suggestHelpdesk,
      pendingActions: [],
      llm: status,
    };
  } catch (error) {
    throw mapDbError(error);
  }
}
