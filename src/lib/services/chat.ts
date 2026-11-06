import { getDb } from "@/lib/bootstrap";
import { answerFromChunks, refuseUnapprovedModel, type ProvidedChunk } from "@/lib/chat/answer";
import { AppError, mapDbError } from "@/lib/errors";
import { asDateOnly } from "@/lib/time";
import { requiredText } from "@/lib/validate";

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
    const cited = draft.citations.map((citation) => citation.chunkId).join(",");
    const saved = await db.withUser(userId, (sql) =>
      sql(
        `insert into chat_logs (user_id, question, answer, cited_chunk_ids)
         values (auth.uid(), $1, $2, $3::uuid[])
         returning id, created_at`,
        [question, draft.answer, `{${cited}}`],
      ),
    );
    return {
      id: String(saved[0]?.id),
      question,
      answer: draft.answer,
      citations: draft.citations,
      suggestHelpdesk: draft.suggestHelpdesk,
    };
  } catch (error) {
    throw mapDbError(error);
  }
}
