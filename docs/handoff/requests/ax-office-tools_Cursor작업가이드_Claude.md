# ax-office-tools 챗봇 고도화 — Cursor 작업 가이드

작성: Claude (Sonnet 5.5), 2026-11-26 · 작업 세션: https://claude.ai/code/session_012qWpDLMx2rNJN8N2zWSbJc
근거 문서: https://claude.ai/artifact/2iHAQ5TKjzuUsewvnKjW3U (Cursor가 열 수 없어도 이 파일만으로 작업할 수 있게 필요한 내용을 옮겼다)

## 0. 시작하기 전에

**현재 상태: 1단계 완료(R-003, GitHub main 19b2679), 2단계 시작(2026-11-26 15:54 JSW님 지시).** docs/design.md는 v0.4(7.4·7.5 혼합 검색)이고 요청은 docs/handoff/requests/R-004-chatbot-stage2_Claude.md 이다. 2단계 작업은 이 가이드 4장이다. 3단계 이후는 Claude가 설계를 먼저 고치고 새 요청 번호로 보낸다.

기준 코드 (2026-11-26 확인): GitHub main = 로컬 main = 19b2679. 그 위에 Claude가 바꾼 문서(design.md v0.4, INBOX.md, R-004, 이 가이드)는 커밋하지 않은 상태다.

(1단계 때의 기준 코드: 로컬 76b0903, GitHub 7e3c1d1. 둘 다 이제 main에 포함됨)

작업 전에 읽을 파일: docs/RULES.md → docs/design.md → docs/handoff/INBOX.md → 이 가이드.

## 1. 지킬 규칙

- 기준 문서는 docs/design.md. **Cursor는 design.md를 고치지 않는다.** 설계와 달라지면 멈추고 docs/handoff/requests/에 요청 파일을 만든 뒤 INBOX에 한 줄 추가한다.
- 작업할 파일을 INBOX '점유' 표에 적고, 끝나면 지운다. Claude가 점유한 파일은 고치지 않는다.
- 구현은 developer, 기능 테스트는 tester 서브에이전트. 구현한 쪽이 자기 결과를 통과 처리하지 않는다. 검수와 보안 점검은 Claude.
- 모델 선택은 Notion 업무 관리 지침서 8절을 따른다. 상위 모델로 바꿔야 하면 추천하고 JSW님 결정을 기다린다.
- 같은 실패가 두 번 반복되면 멈추고 원인과 함께 보고한다.
- 사람 승인 없이 하지 않는 것: 유료 API·LLM 호출, Ollama 모델 내려받기, 삭제(.data 폴더 포함), 배포, 비밀키, 보안 설정, 결제.
- .data 폴더는 지우지 않는다. 2단계 전에 프로젝트 폴더 **밖**에 복사해 둔다(.gitignore에 백업 폴더 이름이 없다).
- DB를 여는 스크립트(load-regulations, embed-regulations)는 앱을 끈 상태에서 실행한다.
- Ollama 호출은 지금처럼 이 PC 주소(loopback)로만 보낸다. Ollama가 꺼져 있거나 LLM_PROVIDER=mock이면 조문 검색으로 동작해야 한다.
- 커밋 작성자는 환경변수로 지정한다: GIT_AUTHOR_NAME=jsw7890, GIT_AUTHOR_EMAIL=142076384+jsw7890@users.noreply.github.com (COMMITTER도 같은 값). git config는 바꾸지 않는다. "Cursor Agent", agent@cursor.local은 쓰지 않는다.
- QA를 통과한 날 18:00(KST)까지 GitHub에 올린다. 이때 아직 안 올라간 76b0903도 함께 올라간다.
- 결과는 R-003의 'Cursor 답변'에 실행한 명령과 실제 수치로 적는다. 실행하지 않은 것은 '미확인'으로 적는다. Notion 투두와 대화 로그에도 남긴다.

개발 전 확인표:

| 항목 | 내용 |
| --- | --- |
| 해결할 문제 | 일상어 평가 질문 정답 0/24, 잘못된 예약·문의 실행 |
| 목적 | 취업용 포트폴리오 |
| 측정 방법 | npm test, npm run eval (3장 S1-2) |
| 비용 한도 | 0원 (유료 API 금지) |
| 기간 한도 | 미정 (JSW님 결정) |
| 중단 기준 | 같은 실패 2회, PC 메모리 부족으로 모델 실행 불가, 설계 변경 필요 |

## 2. 설계 변경 (담당: Claude)

1단계 전 항목 두 개는 design.md v0.3에 반영했다(변경 내용은 design.md 13장). DB 구성(PGlite)도 v0.3 2장에 반영했다. 나머지는 해당 단계 전에 Claude가 고친다.

| 시점 | 지금 설계 | 필요한 변경 |
| --- | --- | --- |
| 1단계 전 | 챗봇 도구는 구현하지 않음, 예약 확정은 화면에서만. 실제 코드는 챗봇이 예약·문의를 바로 저장 | 챗봇은 제안만 하고 화면의 확인 버튼으로 저장. 취소·문의 상태 조회 포함 |
| 1단계 전 | 알림은 범위 밖. 실제 코드에는 알림이 있음 | 현재 구현을 설계에 반영 |
| 2단계 전 | DB는 Supabase. 실제 구현은 PGlite | 실제 구성, 임베딩 테이블, 하이브리드 검색, 거절 기준 |
| 3단계 전 | 대화 기억 없음 | 직전 질문 사용 범위, 생성 모델 |
| A·4단계 전 | 통계 화면, 추가 문서는 범위 밖 | 범위 변경 |

## 3. 1단계 — 오류 수정·데이터 정리·평가 자동화

순서: S1-1 → S1-2 → S1-3 → S1-4 → S1-5 → S1-6 → S1-7 → S1-8

### S1-1. 실행 시각에 따라 실패하는 테스트

- 파일: tests/office-chat.test.ts, "오늘 2시 빈 회의실과 인원만 말해도 예약한다"
- 현상: 한국 시간 14:26과 14:27에 실행하면 "지난 시간은 예약할 수 없습니다"로 실패(30개 중 29개 통과). 오늘 14:00을 예약하기 때문이다. 이 테스트의 DB 예약 문장을 "내일 11시"로 바꾼 복사본은 30개 통과.
- 할 일: 실행 시각과 무관하게 고친다. 테스트끼리 같은 방·시간을 쓰지 않게 한다.

### S1-2. 평가 자동화

- 추가: scripts/eval-chat.ts, tests/eval/questions.json, package.json의 "eval": "tsx scripts/eval-chat.ts"
- LLM과 DB 없이 업무 분류와 조문 검색만 채점한다.
- 현재 코드의 기준선: 일상어 24 = 정답 0, 틀린 조문 6, 답 못 함 18 / 조문 표현 6 = 1순위 5, 2~3순위 1 / 범위 밖 4 = 정상 거절 3, 엉뚱한 조문 1
- 검수용 별도 질문은 Claude가 관리한다. Cursor는 찾아 보거나 개발·조정에 쓰지 않는다.

scripts/eval-chat.ts

```ts
// 평가 질문을 LLM 없이 업무 분류 + 조문 검색에 넣어 채점한다. 실행: npm run eval
import { readFileSync } from "node:fs";
import { answerFromChunks } from "../src/lib/chat/answer";
import { parseOfficeIntent } from "../src/lib/chat/intent";

type Question = { id: string; type: string; q: string; ok: string[] };
type Chunk = { articleNo: string; heading: string; content: string };

const data = JSON.parse(readFileSync("data/regulations/labor-standards-act.json", "utf8"));
const chunks = (data.chunks as Chunk[]).map((c, i) => ({
  id: String(i), title: data.title, articleNo: c.articleNo, heading: c.heading,
  content: c.content, baseDate: data.baseDate, sourceUrl: data.sourceUrl,
}));
const questions: Question[] = JSON.parse(readFileSync("tests/eval/questions.json", "utf8"));
const summary: Record<string, Record<string, number>> = {};

for (const item of questions) {
  const route = parseOfficeIntent(item.q).action;
  const cited = answerFromChunks(item.q, chunks).citations.map((c) => c.articleNo).slice(0, 3);
  let verdict: string;
  if (route !== "none") verdict = `업무로 오분류(${route})`;
  else if (item.ok.length === 0) verdict = cited.length === 0 ? "정상 거절" : "엉뚱한 조문";
  else if (cited.length > 0 && item.ok.includes(cited[0])) verdict = "1순위 정답";
  else if (cited.some((a) => item.ok.includes(a))) verdict = "2~3순위 정답";
  else verdict = cited.length > 0 ? "틀린 조문" : "답 못 함";
  summary[item.type] ??= {};
  summary[item.type][verdict] = (summary[item.type][verdict] ?? 0) + 1;
  console.log([item.id, verdict, cited.join(",") || "-", item.ok.join("/") || "-", item.q].join(" | "));
}
console.log(JSON.stringify(summary, null, 2));
```

tests/eval/questions.json

```json
[
{"id":"D01","type":"일상어","q":"알바 그만두면 월급은 언제까지 받을 수 있어?","ok":["제36조"]},
{"id":"D02","type":"일상어","q":"갑자기 내일부터 나오지 말래. 이래도 돼?","ok":["제23조","제26조","제27조"]},
{"id":"D03","type":"일상어","q":"해고를 문자로 받았는데 효력이 있어?","ok":["제27조"]},
{"id":"D04","type":"일상어","q":"밤 10시 넘어서 일하면 돈을 더 받아?","ok":["제56조"]},
{"id":"D05","type":"일상어","q":"점심시간은 몇 분 줘야 해?","ok":["제54조"]},
{"id":"D06","type":"일상어","q":"일주일에 최대 몇 시간까지 일할 수 있어?","ok":["제50조","제53조"]},
{"id":"D07","type":"일상어","q":"입사한 지 1년이 안 됐는데 쉬는 날이 며칠 생겨?","ok":["제60조"]},
{"id":"D08","type":"일상어","q":"못 쓴 휴가를 회사가 그냥 없앨 수 있어?","ok":["제60조","제61조"]},
{"id":"D09","type":"일상어","q":"아기 낳으면 얼마나 쉴 수 있어?","ok":["제74조"]},
{"id":"D10","type":"일상어","q":"상사가 계속 괴롭히는데 어디에 말해야 해?","ok":["제76조의2","제76조의3"]},
{"id":"D11","type":"일상어","q":"중간에 그만두면 벌금 내라는 계약서 괜찮아?","ok":["제20조"]},
{"id":"D12","type":"일상어","q":"가게 사정으로 일을 못 하게 되면 돈 받을 수 있어?","ok":["제46조"]},
{"id":"D13","type":"일상어","q":"월급을 두 달에 한 번 줘도 돼?","ok":["제43조"]},
{"id":"D14","type":"일상어","q":"밀린 월급은 몇 년 지나면 못 받아?","ok":["제49조"]},
{"id":"D15","type":"일상어","q":"퇴사한 회사에서 경력증명서를 안 떼 줘","ok":["제39조"]},
{"id":"D16","type":"일상어","q":"지각했다고 월급 깎는 건 한도가 있어?","ok":["제95조"]},
{"id":"D17","type":"일상어","q":"직원이 몇 명 이상이면 취업규칙을 신고해야 해?","ok":["제93조"]},
{"id":"D18","type":"일상어","q":"고등학생은 하루에 몇 시간 일할 수 있어?","ok":["제69조"]},
{"id":"D19","type":"일상어","q":"생리 때문에 하루 쉴 수 있어?","ok":["제73조"]},
{"id":"D20","type":"일상어","q":"근로계약서에 꼭 적어야 하는 게 뭐야?","ok":["제17조"]},
{"id":"D21","type":"일상어","q":"야근수당 대신 휴가로 줄 수 있어?","ok":["제57조"]},
{"id":"D22","type":"일상어","q":"직원 4명인 가게도 근로기준법이 적용돼?","ok":["제11조"]},
{"id":"D23","type":"일상어","q":"억울하게 잘렸는데 언제까지 신고해야 해?","ok":["제28조"]},
{"id":"D24","type":"일상어","q":"일주일에 하루는 꼭 쉬게 해 줘야 해?","ok":["제55조"]},
{"id":"F01","type":"조문 표현","q":"연차 유급휴가는 며칠인가요?","ok":["제60조"]},
{"id":"F02","type":"조문 표현","q":"해고의 예고는 며칠 전에 해야 하나요?","ok":["제26조"]},
{"id":"F03","type":"조문 표현","q":"휴게시간 기준이 어떻게 되나요?","ok":["제54조"]},
{"id":"F04","type":"조문 표현","q":"휴업수당은 얼마인가요?","ok":["제46조"]},
{"id":"F05","type":"조문 표현","q":"직장 내 괴롭힘 발생 시 조치는 무엇인가요?","ok":["제76조의3"]},
{"id":"F06","type":"조문 표현","q":"임금의 시효는 몇 년인가요?","ok":["제49조"]},
{"id":"O01","type":"범위 밖","q":"오늘 날씨 어때?","ok":[]},
{"id":"O02","type":"범위 밖","q":"회사 동호회 지원금 규정 알려줘","ok":[]},
{"id":"O03","type":"범위 밖","q":"법인카드 사용 규정이 어떻게 돼?","ok":[]},
{"id":"O04","type":"범위 밖","q":"점심 메뉴 추천해 줘","ok":[]}
]
```

### S1-3. 재적재 명령 오류

- npm run load-regulations가 top-level await 오류로 실행되지 않는다. 아래로 바꾼다.

```ts
import { getDb } from "../src/lib/bootstrap";
import { reloadRegulations } from "../src/lib/regulations";

async function main() {
  const db = await getDb();
  await reloadRegulations(db);
  console.log("규정 조항을 로컬 데이터베이스에 다시 넣었습니다.");
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

### S1-4. 규정 데이터 정리

- 문제: 제116조(24,500자)에 부칙과 웹페이지 잔여 코드가 섞임. 12개 조문 끝에 다음 장 제목이 붙음.
- scripts/clean-regulations.mjs를 추가해 실행하고 npm run load-regulations를 실행한다.

```js
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
```

- 기대 결과: 첫 실행 changed=13, 두 번째 changed=0, chunks=131, 제116조 721자. 평가 기준선 수치는 그대로다.
- scripts/extract-labor-law.mjs로 다시 추출해도 같은 정리가 적용되게 한다.

### S1-5. 업무 분류와 날짜 해석

- 파일: src/lib/chat/intent.ts
- parseOfficeIntent(question, today = seoulToday())처럼 기준일을 넣을 수 있게 해서 테스트를 고정한다.
- 업무(예약·취소·문의)는 요청 표현이 분명할 때만. 규정을 묻는 문장은 action "none". 단어 하나("안", "회의실", "비밀번호")만으로 분류하지 않는다. 지금은 "안내"의 "안"도 고장으로 본다.
- 고장 표현은 "안 켜", "안 돼", "안 됨", "고장", "먹통", "작동하지 않", "초기화"처럼 구체적으로.
- 날짜: 오늘, 내일, 모레·내일모레(+2), 글피(+3), 이번 주·다음 주 X요일(월~일 기준), 요일만 있으면 가장 가까운 앞날, M월 D일, M/D, YYYY-MM-DD. 올해에서 이미 지난 월·일은 다음 해.
- "N시 반"은 N:30. 1~6시를 오후로 보는 기존 규칙은 유지.
- 날짜가 없거나 못 알아들으면 되묻는다. 오늘로 채우지 않는다(`?? seoulToday()` 제거).

합격 표 (기준일 2026-11-26 목요일). '현재'는 2026-11-26에 분류 함수를 실행해 확인한 값이다.

| 입력 | 현재 | 바꾼 뒤 |
| --- | --- | --- |
| 모레 3시 회의실 예약해줘 | 11-26 15시 예약 | 11-28 15:00~16:00 제안 |
| 내일모레 3시 회의실 예약해줘 | 11-27 | 11-28 제안 |
| 다음 주 금요일 오후 3시 회의실 예약해줘 | 11-26 | 12-04 제안 |
| 11/30 3시 회의실 예약해줘 | 11-26 | 11-30 제안 |
| 1월 5일 3시 회의실 예약해줘 | 2026-01-05 | 2027-01-05 제안 |
| 내일 2시 반 회의실 예약해줘 | 14:00 시작 | 14:30 시작 |
| 회의실 예약 취소해줘 오늘 3시 | 새 예약 | 해당 예약 취소 제안 |
| 내 예약 취소해줘 | 목록만 | 취소할 예약 선택 |
| 프린터 문의 상태 알려줘 | 새 문의 등록 | 프린터 문의 상태 조회 |
| 노트북 반출 안내해줘 | 새 문의 등록 | none (문의를 만들지 않음) |
| 컴퓨터 보안 교육은 언제까지 해야 해? | 새 문의 등록 | none |
| 컴퓨터 고장으로 일을 못 하면 임금 받아? | 새 문의 등록 | none |
| 연차 예약은 며칠 전에 해야 해? | 회의실 예약 | none |
| 회의실 예약 규정 알려줘 | 회의실 예약(시각 되묻기) | none |
| 회의실에서 점심 먹어도 돼? | 회의실 예약(시각 되묻기) | none |
| 비밀번호 초기화해줘 | 문의 등록 | 문의 등록 제안 |
| 모니터가 안 켜져요 | 문의 등록 | 문의 등록 제안 |

### S1-6. 확인 후 실행, 취소, 문의 상태 조회

- 파일: src/lib/chat/office.ts, src/lib/services/chat.ts, src/app/chat/page.tsx
- 챗봇은 저장하지 않고 제안을 돌려준다. 저장은 화면의 확인 버튼이 **기존 API**를 호출한다(로그인·같은 출처·DB 규칙 검사를 그대로 쓴다).

```ts
export type PendingAction =
  | { type: "reservation.create"; summary: string;
      payload: { roomId: string; title: string; startAt: string; endAt: string } } // POST /api/reservations
  | { type: "reservation.cancel"; summary: string;
      payload: { reservationId: string } }                                        // DELETE /api/reservations/{id}
  | { type: "ticket.create"; summary: string;
      payload: { category: string; title: string; description: string; urgency: string } }; // POST /api/tickets
// 채팅 응답에 pendingActions: PendingAction[] 추가 (취소 후보가 여럿이면 여러 개)
```

- summary에는 방·날짜(요일)·시각·제목을 보여 준다. 확인을 한 번 누르면 버튼을 잠근다. 실패하면 서버 오류 문장을 보여 준다.
- 지난 시간·운영 시간(09:00~18:00) 밖이면 제안 단계에서 알려 준다. 최종 검사는 DB가 한다.
- 취소 후보는 본인의 앞으로 남은 active 예약만.
- 문의 상태·상세 조회는 질문의 단어(분류·제목)로 찾는다. 지금은 항상 최신 1건(`tickets[0]`)이다. 여러 건이면 목록을 보여 준다.
- 알림 켜기는 "켜", "설정" 같은 요청 표현이 있을 때만 바로 실행한다.
- 즉시 저장을 기대하는 기존 테스트는 "제안만 있고 DB에 없음 → 확인 API 호출 후 있음"으로 바꾼다.

### S1-7. 업무 처리 결과를 LLM이 다시 쓰지 않는다

- polishOfficeWithLocalLlm 호출을 없애고 정해진 문장을 그대로 보여 준다. 화면 상태 문구도 맞춘다.
- 이유: 검사 조건이 결과를 거르지 못한다. 실제 결과가 "회의실 A, 15:00"일 때 가짜 모델 응답 "회의실 C를 내일 9시로 예약했습니다"가 통과했다.

### S1-8. 문서

- README.md의 테스트 수(23개로 적혀 있고 실제 30개), docs/screens.md(확인 버튼 문구), docs/test-report.md를 실제 결과로 갱신한다.

### 1단계 완료 기준

- [ ] npm test 전체 통과, 실행 시각에 의존하는 테스트 없음
- [ ] npm run eval 실행, 평가 질문 34개가 모두 업무로 분류되지 않음(테스트로 고정)
- [ ] 합격 표의 입력이 모두 '바꾼 뒤'대로 동작(테스트 추가)
- [ ] 확인 버튼을 누르기 전에는 예약·문의·취소가 DB에 반영되지 않음
- [ ] 데이터 정리 후 npm run load-regulations 성공
- [ ] npm run build 성공, 브라우저에서 확인 버튼 동작 확인

## 4. 2단계 — 벡터 + 키워드 하이브리드 검색

시작 조건: 1단계 검수 통과(완료), design.md v0.4 반영(완료). 모델은 bge-m3 하나만 받는다: `ollama pull bge-m3`(1.2GB, 1024차원) — 2026-11-26 15:58 JSW님 승인. qwen3-embedding:0.6b는 받지 않는다(웹 조사로 bge-m3 선정, design.md 2장). 승인 기록은 R-004 '모델 내려받기' 줄. 승인 전에는 1)~7) 코드와 가짜 벡터 테스트까지만 하고 실제 임베딩·평가는 멈춘다.

시작 전: `.data` 폴더를 프로젝트 폴더 밖(예: C:\\Users\\hitea\\Desktop\\Cursor\\ax-office-tools-data-backup-20261126)에 복사해 둔다. 지우지 않는다.

1) 설치. PGlite 0.5.15와 맞는 버전을 고정한다(0.1.0은 PGlite 0.6.0용).

```bash
npm install --save-exact @electric-sql/pglite-pgvector@0.0.16
```

2) next.config.ts

```ts
serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
```

3) src/lib/db.ts (기존 .data에도 테이블이 생기게 한다)

```diff
--- a/src/lib/db.ts
+++ b/src/lib/db.ts
@@ -1,5 +1,6 @@
 import { PGlite, type PGliteInterface, type Results, type Transaction } from "@electric-sql/pglite";
 import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
+import { vector } from "@electric-sql/pglite-pgvector";
 import { readdirSync, readFileSync } from "node:fs";
 import path from "node:path";
 import { AppError } from "@/lib/errors";
@@ -39,7 +40,7 @@ async function applyMigrations(db: PGliteInterface) {
 }
 
 export async function createDatabase(dataDir?: string): Promise<OfficeDatabase> {
-  const db = await PGlite.create(dataDir ?? "memory://", { extensions: { btree_gist } });
+  const db = await PGlite.create(dataDir ?? "memory://", { extensions: { btree_gist, vector } });
   await db.waitReady;
   await db.exec("set time zone 'Asia/Seoul'");
 
@@ -54,6 +55,10 @@ export async function createDatabase(dataDir?: string): Promise<OfficeDatabase>
     if (!extras.rows[0]?.name) {
       await execFile(db, path.join(process.cwd(), "supabase", "migrations", "0004_office_chat.sql"));
     }
+    const vectors = await db.query<{ name: string | null }>("select to_regclass('public.regulation_embeddings') as name");
+    if (!vectors.rows[0]?.name) {
+      await execFile(db, path.join(process.cwd(), "supabase", "migrations", "0005_regulation_vectors.sql"));
+    }
   }
 
   return {
```

4) supabase/migrations/0005_regulation_vectors.sql

```sql
create extension if not exists vector;

create table public.regulation_embeddings (
  chunk_id uuid not null references public.regulation_chunks (id) on delete cascade,
  part integer not null default 0,
  model text not null,
  part_text text not null,
  embedding vector(1024) not null,
  primary key (chunk_id, part, model)
);

revoke insert, update, delete on public.regulation_embeddings from authenticated;
grant select on public.regulation_embeddings to authenticated;
alter table public.regulation_embeddings enable row level security;
create policy regulation_embeddings_select on public.regulation_embeddings
  for select to authenticated using (true);
```

5) scripts/embed-regulations.ts (실행: npx tsx scripts/embed-regulations.ts, 다른 모델은 EMBED_MODEL 지정). 규정을 다시 넣으면 임베딩이 지워지므로 다시 실행한다.

```ts
import { getDb } from "../src/lib/bootstrap";

const MODEL = process.env.EMBED_MODEL ?? "bge-m3";

async function embed(input: string[]): Promise<number[][]> {
  // 실제 구현은 src/lib/chat/ollama.ts의 loopback 검사·시간 제한을 재사용한다(설계 7.5). 아래 주소 직접 호출은 시험용 예시다.
  const res = await fetch("http://127.0.0.1:11434/api/embed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  return ((await res.json()) as { embeddings: number[][] }).embeddings;
}

// 긴 조문은 항(①②…) 단위로 나눈다.
function splitParts(content: string): string[] {
  if (content.length <= 700) return [content];
  return content.split(/(?=^\s*[①-⑳])/m).map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const db = await getDb();
  const rows = await db.asOwner((sql) =>
    sql("select id, article_no, heading, content from regulation_chunks order by sort_order"));
  for (const row of rows) {
    const parts = splitParts(String(row.content))
      .map((p) => `근로기준법 ${row.article_no}(${row.heading})\n${p}`);
    const vectors = await embed(parts);
    await db.asOwner(async (sql) => {
      await sql("delete from regulation_embeddings where chunk_id = $1 and model = $2", [row.id, MODEL]);
      for (let i = 0; i < parts.length; i++) {
        await sql(
          `insert into regulation_embeddings (chunk_id, part, model, part_text, embedding)
           values ($1, $2, $3, $4, $5::vector)`,
          [row.id, i, MODEL, parts[i], JSON.stringify(vectors[i])]);
      }
    });
  }
  const done = await db.asOwner((sql) =>
    sql("select count(*)::int as parts, count(distinct chunk_id)::int as chunks, max(char_length(part_text))::int as longest from regulation_embeddings"));
  console.log(done[0]);
  await db.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
```

6) 검색 쿼리 (RRF). $1 질문 벡터, $2 모델 이름, $3 키워드 검색이 고른 조문 ID 배열

```sql
with v as (
  select chunk_id,
         row_number() over (order by min(embedding <=> $1::vector)) as rn,
         1 - min(embedding <=> $1::vector) as similarity
  from regulation_embeddings
  where model = $2
  group by chunk_id
  order by rn limit 20
),
k as (
  select chunk_id, rn
  from unnest($3::uuid[]) with ordinality as t(chunk_id, rn)
)
select c.id, c.article_no, v.similarity,
       coalesce(1.0/(60+v.rn), 0) + coalesce(1.0/(60+k.rn), 0) as score
from v
full outer join k on v.chunk_id = k.chunk_id
join regulation_chunks c on c.id = coalesce(v.chunk_id, k.chunk_id)
order by score desc, c.sort_order
limit 3;
```

7) 연결할 때
- 새 모듈(예: src/lib/chat/search.ts)에서 질문 임베딩과 검색을 맡는다. 임베딩 호출에도 loopback 검사와 시간 제한을 둔다.
- Ollama 꺼짐, mock, 임베딩 없음이면 지금의 키워드 검색으로 돌아간다.
- 하이브리드에서는 단어 목록(REGULATION_CUE) 대신 유사도 기준값으로 거절한다. 값은 평가 질문으로 정하고 기록한다.
- 연소자 조문 제외 규칙은 하이브리드 결과에도 적용한다.
- npm run eval에 하이브리드 모드를 추가해 키워드 검색과 나란히 상위 1개·3개 정답을 기록한다. 모델은 bge-m3만 쓴다(질문에 지시문 불필요).

완료 기준: 일상어 질문 상위 3개 정답 20/24(80%) 이상, 조문 표현 6/6 유지, 범위 밖 4개 거절. 이후 Claude가 별도 질문으로 검수한다. 수치가 미달이면 있는 그대로 보고한다.

## 5. 3단계 — 답변 품질

시작 조건: design.md 반영, JSW님 승인 후 `ollama pull qwen3.5:2b`(2.7~3.1GB). 부족할 때만 4b. 이 PC(메모리 16GB, 확인 시점 여유 347MB)에서 gemma4는 우선 제외.

- 모델은 OLLAMA_MODEL로 바꾼다. 요청에 "think": false를 넣어 시험한다.
- 근거: 지금은 1순위 조문의 앞 700자만 모델에 간다. 상위 2~3개 조문의 관련 항 전체를 넘긴다(num_ctx, num_predict 재조정).
- 근거 검사: 숫자와 단위가 정확히 일치해야 통과. 지금은 글자 포함 여부라 연차 조문에서 "5일", "8일"도 통과한다. 조문 원문은 항상 함께 보여 준다.
- 후속 질문: 직전 질문을 함께 넣어 검색한다.

완료 기준: 긴 조문 뒷부분 질문에 답함, 틀린 숫자 차단 테스트 통과, 모델별 정답률·응답 시간 기록.

## 6. 4단계와 추가 항목 (착수 전에 Claude가 설계)

권장 순서: 1단계 → 2단계 → A·B → 나머지

| 구분 | 항목 | 내용 | 규모(추정) |
| --- | --- | --- | --- |
| 4단계 | 문서·시연 | 가상 취업규칙 추가(법령과 구분), 찾은 조문·점수와 키워드/하이브리드 비교 화면, 전후 비교표, 1~2분 영상 | 작음~중간 |
| A | 질문 기록·평가 화면 | 좋아요·싫어요(별도 테이블 필요: chat_logs는 수정 권한 없음), 답 못 한 질문 목록, 전후 수치 | 중간 |
| B | 포트폴리오 설명 | README에 문제→지표→결정→결과, 설계 대비 변경 | 작음 |
| C | 출처·대화 사용성 | 출처 링크, 조문 펼치기, 기록 불러오기, 답 순차 표시 | 작음 |
| C | 개인정보 보호 | 저장 전 전화번호·이메일 가리기, 악의적 입력 시험 | 작음~중간 |
| D | 규정 문서 관리 | 관리자 업로드 → 조문 분리·재색인 | 중간 |
| E | LLM 도구 호출 | 업무·값 추출, 빠진 값 이어받기, 확인 후 실행. 모델 지원과 PC 속도 확인 후 결정 | 큼 |

## 7. 확인한 범위와 확인하지 못한 것

2026-11-26, Claude의 Linux 작업 환경(복사본)에서 확인:
- S1-2·S1-3·S1-4의 코드 실행, S1-1의 문장 교체 후 테스트 30개 통과
- 2단계 1)~6): 확장 없이 만든 DB를 다시 열어 pgvector 추가, 가짜 벡터로 직원 권한 검색·삭제 거부 확인, next.config.ts 변경 후 npm run build 성공
- 정리한 데이터에서 가짜 임베딩 모델로 임베딩 스크립트 실행: 131개 조문, 190조각(머리말 포함 최장 706자). 6) 검색 쿼리도 같은 DB에서 직원 권한으로 실행

확인하지 못한 것:
- JSW님 PC(Windows)에서의 실행과 브라우저 화면
- 실제 임베딩 모델의 정확도·속도, 생성 모델 품질, 그래픽 가속, 모델 사용 조건
- S1-5~S1-7과 3단계 이후는 요구 사항이며 구현·시험한 코드가 없다
