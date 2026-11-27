import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attachCitation, orderCitationsByArticles } from "../src/lib/chat/ollama";
import { answerIsGrounded, articlesAllowed, extractNumberUnits } from "../src/lib/chat/grounding";
import type { DraftAnswer } from "../src/lib/chat/answer";

describe("숫자+단위 근거 검사", () => {
  const leave = "연차 유급휴가는 15일이다. 1년 동안 80퍼센트 이상 출근한 근로자.";

  test("조문에 있는 15일은 통과하고 20일은 막는다", () => {
    assert.equal(answerIsGrounded("연차는 15일입니다.", leave), true);
    assert.equal(answerIsGrounded("연차는 20일입니다.", leave), false);
  });

  test("띄어쓰기 차이는 같게 본다", () => {
    assert.equal(answerIsGrounded("1 년 동안 80 % 출근", leave), true);
  });

  test("근거에 없는 연소자 나이는 막는다", () => {
    assert.equal(answerIsGrounded("15세 이상 18세 미만은 하루 7시간입니다.", leave), false);
  });

  test("넘겨준 조문만 articles로 받는다", () => {
    assert.equal(articlesAllowed(["제60조"], ["제60조", "제61조"]), true);
    assert.equal(articlesAllowed(["제99조"], ["제60조"]), false);
    assert.equal(articlesAllowed([], ["제60조"]), false);
  });

  test("숫자+단위를 뽑는다", () => {
    assert.deepEqual(extractNumberUnits("40시간, 1주, 15일"), [
      { number: "40", unit: "시간" },
      { number: "1", unit: "주" },
      { number: "15", unit: "일" },
    ]);
  });

  test("검색 1위와 모델 조문이 다르면 출처는 모델 조문이다", () => {
    const draft: DraftAnswer = {
      answer: "검색 초안",
      suggestHelpdesk: false,
      citations: [
        {
          chunkId: "1",
          docTitle: "근로기준법",
          articleNo: "제67조",
          heading: "미성년자",
          baseDate: "Thu Oct 08 2026 09:00:00 GMT+0900",
          sourceUrl: "https://example.com",
        },
        {
          chunkId: "2",
          docTitle: "근로기준법",
          articleNo: "제42조",
          heading: "계약 서류",
          baseDate: "2026-10-08",
          sourceUrl: "https://example.com",
        },
      ],
    };
    const text = attachCitation("사용자는 중요한 서류를 3년간 보존해야 합니다.", draft, ["제42조"]);
    assert.match(text, /출처: 근로기준법 제42조 \(기준일 2026-10-08\)/);
    assert.doesNotMatch(text, /제67조/);
    assert.doesNotMatch(text, /Thu Oct 08/);
    assert.equal(orderCitationsByArticles(draft.citations, ["제42조"])[0]?.articleNo, "제42조");
  });
});
