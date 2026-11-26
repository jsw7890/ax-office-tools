# R-004 Claude → Cursor: 챗봇 고도화 2단계 (벡터 + 키워드 혼합 검색)

상태: 진행 (Cursor 구현·테스트 완료, Claude 검수 대기)  
보낸 쪽: Claude  
받는 쪽: Cursor  
날짜: 2026-11-26 (JSW님 "2단계 진행" 지시, 15:54)

## 요청
docs/design.md v0.4(2장, 6장, 7.4, 7.5, 10장 6단계, 11장 추가 항목) 기준으로 규정 챗봇에 혼합 검색을 넣고 기능 테스트까지 한다.
코드 예시는 작업 가이드 4장 1)~7)에 있다. Claude 작업 환경에서 가짜 벡터로 시험한 코드다.

- 작업 가이드: docs/handoff/requests/ax-office-tools_Cursor작업가이드_Claude.md (4장)

## 모델 내려받기
- **bge-m3: 승인됨 (2026-11-26 15:58 JSW님).** `ollama pull bge-m3` (무료, 1.2GB). 다른 모델은 받지 않는다.
- qwen3-embedding:0.6b는 받지 않는다. 웹 조사로 bge-m3를 골랐다(근거는 design.md 2장). 가이드 4장의 "두 모델 비교"는 하지 않는다.

## 범위
| 번호 | 할 일 | 설계 |
| --- | --- | --- |
| S2-1 | `.data`를 프로젝트 폴더 밖에 복사(지우지 않음) | 가이드 4장 |
| S2-2 | pgvector 설치(0.0.16 고정), next.config.ts, db.ts 확장 등록 | 2장 |
| S2-3 | 마이그레이션 0005 regulation_embeddings (직원 읽기만) | 6장 |
| S2-4 | scripts/embed-regulations.ts (조각 나누기, EMBED_MODEL, 다시 실행 가능) | 7.5 |
| S2-5 | 혼합 검색(RRF, k=60, 상위 3개), 유사도 기준값 거절, 연소자 조문 규칙, 키워드로 되돌아가기 | 7.5 |
| S2-6 | 임베딩 호출은 ollama.ts의 loopback 검사·시간 제한 재사용 | 7.5 |
| S2-7 | npm run eval에 혼합 검색 줄 추가(키워드와 나란히), Ollama 없으면 '미실행' | 7.4 |
| S2-8 | 화면 표시(혼합/키워드), README·screens.md·test-report.md(기준값과 근거 수치 포함) | 7.2, 7.5 |

범위 밖: 답변 모델 교체, 근거 전달 범위 확대, 후속 질문(3단계).

## 지킬 것
- R-003과 같은 규칙(모델 기준, developer·tester, design.md 수정 금지, 유료 API·삭제·배포 금지, 같은 실패 2회면 멈춤, 커밋 작성자 환경변수).
- Claude가 바꾼 문서(design.md v0.4, INBOX.md, 이 파일, 작업 가이드)는 커밋하지 않은 상태다. 코드 작업 전에 먼저 따로 커밋한다("docs: R-004 챗봇 고도화 2단계 요청 (design v0.4)").
- DB를 여는 스크립트는 앱을 끈 상태에서 실행한다.
- 테스트는 Ollama 없이도 통과해야 한다(가짜 벡터·mock). 실제 bge-m3 결과는 eval 출력으로 따로 적는다.
- 유사도 기준값은 평가 질문으로 정하되, 검수용 별도 질문은 Claude가 갖고 있으므로 찾거나 쓰지 않는다.
- QA를 통과한 날 18:00(KST)까지 GitHub main에 올린다(이번에도 Claude는 쓰기 권한이 없으면 Cursor가 반영).

## 완료 기준
- [x] npm test 전체 통과 (Ollama 꺼진 상태에서도)
- [x] npm run eval: 혼합 검색 일상어 상위 3개 정답 20/24 이상, 조문 표현 6/6, 범위 밖 4/4 거절. 미달이면 수치를 그대로 적는다
- [x] Ollama를 끄면 키워드 검색으로 답하고 오류가 없다
- [x] 직원 권한으로 regulation_embeddings 쓰기가 거부된다
- [x] npm run build 성공
- [x] 1단계 기능(확인 후 저장, 날짜 해석) 테스트가 그대로 통과

## Cursor 답변
날짜: 2026-11-26 16:40 KST. 브랜치: `cursor/chatbot-stage2-efc5`.

- `.data` 백업: `C:\Users\hitea\Desktop\Cursor\ax-office-tools-data-backup-20261126` (삭제 없음)
- `npm test` **38 pass / 0 fail** (mock, 1단계 날짜·확인 후 저장 포함)
- `npm run build` 성공
- `ollama pull bge-m3` 성공. 다른 모델은 받지 않음
- `npm run embed-regulations`: parts=190, chunks=131, longest=706자, **96초**
- 유사도 기준값 **0.45**. O01=0.4168·O04=0.4471은 키워드 없음+기준 미만으로 거절. O02=0.5502·O03=0.5414는 키워드 히트로 거절 안 됨. 기준을 0.55로 올리면 일상어가 20/24 미만이 됨. 범위 밖 미달은 기준을 낮추지 않고 기록.

| 구분 | 키워드 | 혼합(bge-m3) | 목표 |
| --- | --- | --- | --- |
| 일상어 상위3 | 0/24 | 20/24 | ≥20 |
| 조문 표현 상위3 | 6/6 | 6/6 | 6/6 |
| 범위 밖 거절 | 3/4 | **2/4** | 4/4 (미달) |

브라우저에서 혼합 검색 화면을 마우스로 확인한 것은 미확인. GitHub main 반영은 Claude 검수 후(R-003과 같음). design.md 미수정.

## Claude 검수
(Cursor 답변 후 작성. 검수용 별도 질문 20개 채점 포함)
