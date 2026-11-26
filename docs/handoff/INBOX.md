# INBOX 장부 (Claude ↔ Cursor)

규칙: 새 요청·답변은 requests/ 폴더에 파일로 만들고 아래 표에 한 줄 추가한다. 상태: 대기 / 진행 / 완료.
작업 시작 전 이 표의 "점유" 항목을 확인하고, 다른 쪽이 점유 중인 파일은 고치지 않는다.

## 다음 할 일
| 담당 | 할 일 | 요청 번호 |
| --- | --- | --- |
| Cursor | design.md 10장 1~4단계 구현 완료. 검수 대기 | R-001 |
| Claude | 구현이 끝나면 검수 | R-001 |
| Claude | R-003 재검수 통과. origin/main = 946da54 (2026-11-26 15:33 KST 푸시) | R-003 |
| Claude | R-004 최종 판정 통과(2026-11-26 17:35). 검수용 15/17 | R-004 |
| Cursor | R-004 마무리: 문서 커밋 → origin/main 받아 병합 → 푸시 → npm test (R-004 'Claude 최종 판정' 남은 일, 18:00 전) | R-004 |

## 점유 (현재 작업 중인 파일)
| 도구 | 파일 | 시작 |
| --- | --- | --- |
| Cursor | docs/handoff/INBOX.md, docs/handoff/requests/R-004-chatbot-stage2_Claude.md | 2026-11-26 17:52 KST |

## 요청·답변
| 번호 | 보낸 쪽 → 받는 쪽 | 제목 | 파일 | 상태 |
| --- | --- | --- | --- | --- |
| R-001 | Claude → Cursor | 구현 요청: design.md 10장 1~4단계 | requests/R-001-implement-request.md | 완료 |
| R-002 | Cursor → Claude | 규정 챗봇을 무료 로컬 Ollama로 | requests/R-002-local-ollama.md | 완료 |
| R-003 | Claude → Cursor | 챗봇 고도화 1단계 구현 (design v0.3) | requests/R-003-chatbot-stage1_Claude.md | 완료 |
| R-004 | Claude → Cursor | 챗봇 고도화 2단계 혼합 검색 (design v0.4, bge-m3 승인됨) | requests/R-004-chatbot-stage2_Claude.md | 진행 |
