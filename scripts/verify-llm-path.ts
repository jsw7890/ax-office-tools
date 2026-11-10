import { resetDbForTests } from "../src/lib/bootstrap";
import { askQuestion } from "../src/lib/services/chat";

process.env.DATABASE_PATH = "memory";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.LLM_PROVIDER = "ollama";
process.env.OLLAMA_MODEL = "qwen2.5:0.5b";
process.env.OLLAMA_HOST = "http://127.0.0.1:11434";

async function main() {
  const db = await resetDbForTests();
  const people = await db.asOwner((sql) => sql("select id, name, email from profiles"));
  const staff = people.find((row) => row.email === "staff@example.com");
  console.log("USER", staff);
  const result = await askQuestion(String(staff?.id), "1주 근로시간은 최대 몇 시간인가요?");
  console.log(
    JSON.stringify(
      {
        name: staff?.name,
        llm: result.llm,
        citations: result.citations.map((citation) => `${citation.docTitle} ${citation.articleNo}`),
        answer: result.answer,
      },
      null,
      2,
    ),
  );
}

void main();
