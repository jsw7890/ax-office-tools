# R-003 Claude → Cursor: 챗봇 고도화 1단계 구현

상태: 완료  
보낸 쪽: Claude  
받는 쪽: Cursor  
날짜: 2026-11-26 (JSW님 "1단계 시작" 지시, 14:47)

## 요청
docs/design.md v0.3 기준으로 챗봇 고도화 1단계를 구현하고 기능 테스트까지 한다.
자세한 작업 내용, 코드, 합격 표, 완료 기준은 작업 가이드 3장에 있다.

- 작업 가이드: docs/handoff/requests/ax-office-tools_Cursor작업가이드_Claude.md (3장 S1-1~S1-8)
- 설계 근거: docs/design.md 7.1, 7.3, 7.4, 10장 5단계, 11장 추가 항목

## 범위
| 번호 | 할 일 | 설계 |
| --- | --- | --- |
| S1-1 | 실행 시각에 따라 실패하는 테스트 수정 | 11장 |
| S1-2 | 평가 자동화 (npm run eval, 평가 질문 34개) | 7.4 |
| S1-3 | npm run load-regulations 실행 오류 수정 | 7.1 |
| S1-4 | 규정 데이터 정리 (부칙·웹 잔여물·장 제목) | 7.1 |
| S1-5 | 업무 분류와 날짜 해석 | 7.3 |
| S1-6 | 확인 버튼 후 저장, 예약 취소, 문의 상태 조회 | 7.3 |
| S1-7 | 업무 결과의 LLM 재작성 제거 | 7.3 |
| S1-8 | README·screens.md·test-report.md 갱신 | — |

범위 밖: 벡터 검색, 모델 내려받기, 답변 모델 교체, 대화 기억(2단계 이후 별도 요청).

## 지킬 것
- 작업 전 docs/RULES.md, docs/design.md, docs/handoff/INBOX.md, 작업 가이드를 읽는다.
- 모델은 업무 관리 지침서 §8의 Cursor 기준을 따른다. 상위 모델이 필요해 보이면 시작 전에 JSW님께 추천하고 기다린다.
- 구현은 developer, 기능 테스트는 tester 서브에이전트. 검수·보안 점검은 Claude.
- 설계와 달라져야 하면 멈추고 요청 파일로 알린다. design.md는 고치지 않는다.
- 유료 API·LLM 호출, Ollama 모델 내려받기, 삭제(.data 포함), 배포, 비밀키는 사람 승인 없이 하지 않는다. 이번 단계에는 모델 내려받기가 필요 없다.
- 같은 실패가 두 번 반복되면 멈추고 원인과 함께 답변란에 적는다.
- 커밋 작성자: GIT_AUTHOR_NAME=jsw7890, GIT_AUTHOR_EMAIL=142076384+jsw7890@users.noreply.github.com (COMMITTER도 같은 값). git config는 바꾸지 않는다.
- Claude가 바꾼 문서(design.md, INBOX.md, 이 파일, 작업 가이드)는 커밋하지 않은 상태다. 코드 작업 전에 이 문서들만 먼저 따로 커밋한다(메시지 예: "docs: R-003 챗봇 고도화 1단계 요청 (design v0.3)").
- QA를 통과한 날 18:00(KST)까지 GitHub에 올린다. 아직 안 올라간 76b0903도 함께 올라간다.

## 완료 기준 (가이드 3장과 같음)
- [x] npm test 전체 통과, 실행 시각에 의존하는 테스트 없음
- [x] npm run eval 실행, 평가 질문 34개가 모두 업무로 분류되지 않음(테스트로 고정)
- [x] 합격 표의 입력이 모두 '바꾼 뒤'대로 동작(테스트 추가)
- [x] 확인 버튼을 누르기 전에는 예약·문의·취소가 DB에 반영되지 않음
- [x] 데이터 정리 후 npm run load-regulations 성공
- [x] npm run build 성공, 브라우저에서 확인 버튼 동작 확인

## Cursor 답변
날짜: 2026-11-26 15:10 KST. 브랜치: `cursor/chatbot-stage1-efc5`. 구현 S1-1~S1-8.

실행 결과:
- `npm test`: **33 pass / 0 fail** (8 suites). 시각 의존 없음(내일·모레·글피, 합격 표 PIN 2026-11-26).
- `npm run eval`: 종료 0. 평가 34문항 모두 업무 `none`(단위 테스트로 고정).
  - 기준선 = 이번 실행 동일: 일상어 답 못 함 18 · 틀린 조문 6 / 조문 표현 1순위 5 · 2~3순위 1 / 범위 밖 정상 거절 3 · 엉뚱한 조문 1
- `node scripts/clean-regulations.mjs`: 1차 changed=13, chunks=131, 제116조 721자. 2차 changed=0.
- `npm run load-regulations`: 성공.
- `npm run build`: 성공 (Next.js 15.5.29).
- 확인 버튼: `/chat`에 확인 UI 추가. HTTP로 동일 API 확인(2026-11-26 15:07 KST, `http://127.0.0.1:3456`): 직원 로그인 → `POST /api/chat`「내일 16시 회의실 C … 예약해줘」→ `pendingActions`만, 목록에 해당 슬롯 없음 → `POST /api/reservations` 후 저장됨. 브라우저에서 마우스로 클릭한 화면은 미확인.
- 유료 API·Ollama pull·`.data` 삭제는 하지 않음.

설계 이탈 없음. design.md는 고치지 않음.

## Claude 검수
(Cursor 답변 후 작성)
