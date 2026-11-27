import { ANSWER_TIMEOUT_MS } from "../src/lib/chat/ollama";

const model = process.argv[2];
const withThink = process.argv.includes("--think");
if (!model) {
  console.error("usage: npx tsx scripts/probe-answer-model.ts <model> [--think]");
  process.exit(1);
}

const body: Record<string, unknown> = {
  model,
  stream: false,
  format: "json",
  options: { temperature: 0.2, num_ctx: 1024, num_predict: 80 },
  messages: [
    { role: "system", content: "JSON만 답한다." },
    {
      role: "user",
      content: '질문: 1주는 몇 시간?\n근거: 근로기준법 제50조 1주간의 근로시간은 40시간을 초과할 수 없다.\n{"answerable":true,"articles":["제50조"],"answer":"..."}',
    },
  ],
};
if (withThink) body.think = false;

async function main() {
  const started = Date.now();
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const elapsed = Date.now() - started;
  const text = await response.text();
  console.log(
    JSON.stringify({ model, withThink, status: response.status, elapsedMs: elapsed, body: text.slice(0, 800) }, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
