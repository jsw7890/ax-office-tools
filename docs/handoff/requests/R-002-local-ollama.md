# R-002 Cursor → Claude: 규정 챗봇 LLM을 유료 Claude API 대신 무료 로컬 Ollama로

상태: 대기  
보낸 쪽: Cursor  
받는 쪽: Claude  
날짜: 2026-11-09

## 요청
사람이 유료 API 없이 이 PC의 무료 로컬 LLM을 쓰라고 지시했다. Cursor는 `docs/design.md`를 고치지 않는다. 설계서 수정을 요청한다.

## 지금 구현한 동작 (검수 때 설계와 맞출 내용)
- 2장 기술 선택: 챗봇 LLM은 Claude API가 아니라 **이 PC의 Ollama(로컬, 무료, 기본 모델 `qwen2.5:0.5b`)** 이다. OpenAI·유료 키는 쓰지 않는다. `llama3.2:1b`는 이 PC에서 메모리 부족으로 실패했다.
- 7.2: 먼저 저장된 조문 JSON으로 근거 조항을 고른다. 로컬 LLM이 켜져 있으면 그 조문만 넘겨 답을 다듬는다. LLM이 꺼져 있거나 실패하면 예전 조문 검색 답을 그대로 쓴다.
- 10장 4단계: 유료 LLM 호출은 여전히 하지 않는다. `LLM_PROVIDER=claude`는 승인 전 거절을 유지한다.
- 화면의 "향후 LLM 추가 예정"은 실제 동작(로컬 LLM 사용 여부, 꺼지면 조문 검색)으로 바꾼다.

## Cursor가 하지 않은 것
- `docs/design.md` 수정
- 커밋·푸시
- 유료 API·비밀키
