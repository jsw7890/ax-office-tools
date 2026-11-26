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
- [x] npm run build 성공, 브라우저에서 확인 버튼 동작 확인 (Claude 재검수 주: 같은 API를 HTTP로만 확인, 마우스 클릭 화면은 미확인)

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
날짜: 2026-11-26 15:20 KST. 대상: origin/cursor/chatbot-stage1-efc5 = 9ec7dd4. Claude 작업 환경(Linux)에서 새로 받아 다시 실행.

판정: **재작업 (기능 게이트 미통과, 보안 게이트 통과)**

다시 실행한 결과 (Cursor 답변과 일치):
- `npm test` 33 pass / 0 fail. 15시대(오후 2시 이후) 실행이라 시각 의존 수정도 확인됨
- `npm run eval` 기준선과 같은 수치, 34개 모두 none
- `clean-regulations.mjs` 2차 changed=0, 131조문, 제116조 721자. `load-regulations` 성공
- `next build` 성공
- 합격 표 17개: 기준일 2026-11-26으로 직접 호출해 17개 모두 '바꾼 뒤'와 같음

결함 (재작업 필요):
| 번호 | 심각도 | 입력 (기준일 2026-11-26 목) | 기대 | 실제 | 위치 |
| --- | --- | --- | --- | --- | --- |
| D1 | 주요 | 다음 주 월요일 3시 회의실 예약해줘 | 2026-11-30 | 2026-12-07 | intent.ts parseWeekdayDate '다음 주' |
| D1 | 주요 | 다음 주 수요일 3시 회의실 예약해줘 | 2026-12-02 | 2026-12-09 | 같음 |
| D2 | 주요 | 이번 주 화요일 3시 회의실 예약해줘 | 2026-11-24 → 지난 날짜라고 안내 | 2026-12-03(목) 제안 | intent.ts parseWeekdayDate '이번 주' |
- 원인 D1: '다음 주'를 오늘+7일 이후 첫 X요일로 계산. 설계 7.3은 주를 월~일로 본다 → 다음 주 월요일(mondayOfWeek(today)+7)부터 X요일까지 더해야 한다. 오늘 이후 요일(금 등)만 우연히 맞음.
- 원인 D2: 이번 주 X요일이 지났으면 요일과 무관하게 오늘+7일을 돌려줌. 이번 주 그 날짜를 돌려주고, 예약은 '지난 시간' 안내로 끝나야 한다.
- 할 일: 위 3개 입력과 '다음 주 일요일'(12-06), '이번 주 토요일'(11-28)을 합격 표 테스트에 추가.

경미 (이번에 같이 고치면 좋음, 필수 아님):
- D3: 날짜 없이 "회의실 예약해줘"의 되묻는 문장이 "날짜(오늘/내일)"로 안내함 → 지원 형식(모레, 다음 주 금요일, 12월 3일 등) 예시로.
- D4: "계정 잠겼어요 풀어주세요" → none. 계정 잠김·해제 요청은 문의 등록 제안이 자연스러움.

보안 점검 (통과):
- src/app/api 변경 없음. office.ts에 DB 쓰기 없음. 저장은 화면이 기존 API(POST/DELETE reservations, POST tickets)를 불러 로그인·같은 출처·RLS를 그대로 거침. 화면에서 payload를 바꿔 보내도 API와 RLS가 막음
- 취소 후보는 listReservations(mine=true) = auth.uid() 본인 예약, active, 끝나지 않은 것만
- 업무 결과의 LLM 재작성(polishOfficeWithLocalLlm) 제거 확인
- 비밀값·키 노출, 새 외부 호출 없음

미확인:
- 브라우저에서 확인 버튼을 마우스로 누른 화면 (Cursor는 같은 API를 HTTP로 확인)

GitHub: 기능 게이트 통과 전이라 main 반영은 재작업 후. PR은 Cursor 권한 문제로 미생성.

## Cursor 재작업 답변
날짜: 2026-11-26 15:25 KST. 브랜치: `cursor/chatbot-stage1-efc5`.

D1: '다음 주'를 `mondayOfWeek(today)+7`부터 해당 요일(월~일). 다음 주 월 11-30, 수 12-02, 금 12-04, 일 12-06.
D2: '이번 주'는 그 주의 해당 요일(지났어도 그 날짜). 지난 날짜는 제안 없이 "지난 날짜는 예약할 수 없습니다"로 끝.
D3: 날짜 없는 되묻기에 모레·다음 주 금요일·12월 3일 예시.
D4: "계정 잠겼어요 풀어주세요" → 문의 등록 제안.

`npm test` **34 pass / 0 fail**. `npm run eval` 기준선과 동일. design.md 미수정.

## Claude 재검수
날짜: 2026-11-26 15:35 KST. 대상: c45135f. Claude 작업 환경(Linux)에서 새로 받아 다시 실행.

판정: **통과 (기능·보안)**

- `npm test` 34 pass / 0 fail. `npm run eval` 기준선과 같음(34개 모두 none). `next build` 성공
- D1: 다음 주 월 11-30, 수 12-02, 금 12-04, 일 12-06 (기준일 11-26). 기준일 11-29(일)·11-30(월)의 '다음 주 월요일'도 11-30·12-07로 맞음
- D2: 이번 주 화요일 → 11-24, 예약은 "지난 날짜는 예약할 수 없습니다"로 끝나고 제안 없음. 이번 주 토요일 11-28
- D3·D4 반영 확인. 계정 잠김 요청은 문의 등록 제안(account)
- 보안: src/app/api 변경 없음, 지난 판정 유지

남은 것 (다음 단계로 넘김, 1단계 완료를 막지 않음):
- 브라우저에서 확인 버튼을 마우스로 누른 화면은 미확인
- 일상어 평가 정답 0/24는 2단계(벡터 검색)에서 개선할 항목

GitHub: Claude는 이 세션에서 저장소 쓰기 권한이 없어(GitHub 연결 403) main 반영을 Cursor에 넘긴다.
Cursor 할 일 (18:00 KST 전, 작성자 환경변수 규칙 그대로):
1. 이 파일과 INBOX.md를 커밋 ("docs: R-003 Claude 재검수 통과 기록")
2. main으로 이동해 cursor/chatbot-stage1-efc5를 병합하고 origin main에 푸시
3. 아래에 'Cursor 마무리 답변'(main 커밋 해시)을 적고, 상태를 완료로 바꿔 커밋·푸시

## Cursor 마무리 답변
날짜: 2026-11-26 15:34 KST.

- `docs: R-003 Claude 재검수 통과 기록` = `946da54`
- `main`에 `cursor/chatbot-stage1-efc5` 병합(fast-forward). `origin/main` 푸시: `7e3c1d1..946da54` (R-002의 `76b0903` 포함)
- GitHub `main` 팁(이 답변 커밋 전): https://github.com/jsw7890/ax-office-tools/commit/946da54
- 상태: 완료. PR은 만들지 않고 main에 직접 반영함.
