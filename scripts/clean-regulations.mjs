// 규정 JSON에서 웹페이지 잔여물(부칙 포함)과 조문 끝에 붙은 장 제목을 지운다. 여러 번 실행해도 결과가 같다.
import { readFileSync, writeFileSync } from "node:fs";

const file = "data/regulations/labor-standards-act.json";
const doc = JSON.parse(readFileSync(file, "utf8"));
let changed = 0;

for (const chunk of doc.chunks) {
  let text = chunk.content;
  const junk = text.indexOf("'); return false;");
  if (junk >= 0) text = text.slice(0, junk);
  text = text.replace(/\n\s*제\d+장(의\d+)?\s[^\n]*$/, "").trim();
  if (text !== chunk.content) {
    console.log(`${chunk.articleNo}: ${chunk.content.length} -> ${text.length}`);
    chunk.content = text;
    changed += 1;
  }
}

writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`chunks=${doc.chunks.length} changed=${changed}`);