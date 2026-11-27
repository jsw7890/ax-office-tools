import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { answerIsGrounded, articlesAllowed, extractNumberUnits } from "../src/lib/chat/grounding";

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
});
