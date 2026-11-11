import { getDb } from "@/lib/bootstrap";
import { answerFromChunks, refuseUnapprovedModel, type ProvidedChunk } from "@/lib/chat/answer";
import { handleOfficeQuestion } from "@/lib/chat/office";
import { localLlmModel, polishWithLocalLlm, probeLocalLlm, type LocalLlmStatus } from "@/lib/chat/ollama";
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
      status.mode = status.available ? "local_llm" : "article_search";
      status.used = false;
      status.detail = status.available
        ? `로컬 LLM(${status.model})이 켜져 있고, 이번 질문은 회의실·IT 업무로 처리했습니다.`
        : "로컬 LLM 꺼짐 · 회의실·IT 업무는 규칙으로 처리하고, 규정은 조문 검색으로 답합니다.";
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
    const draft = answerFromChunks(question, chunks);
    const status = await chatLlmStatus();
    const polished = status.available ? await polishWithLocalLlm(question, draft, status.model) : null;
    const answer = polished ?? draft.answer;
    if (!polished) {
      status.used = false;
      status.mode = "article_search";
      if (status.available && draft.citations.length > 0) {
        status.detail = `로컬 LLM(${status.model})이 이번 답을 만들지 못해 조문 검색으로 답했습니다. 꺼져 있으면 조문 검색으로 답합니다.`;
      }
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
      suggestHelpdesk: draft.suggestHelpdesk,
      llm: status,
    };
  } catch (error) {
    throw mapDbError(error);
  }
}
