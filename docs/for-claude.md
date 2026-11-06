# 클로드용: 이 버전 받기

포트폴리오 글은 여기서 쓰지 않습니다. 이 문서는 최신 앱을 받아 화면과 동작을 확인할 때 쓰는 안내입니다.

## 받는 곳

이 컴퓨터에는 GitHub 원격이 연결되어 있지 않습니다. 최신 파일은 이 폴더입니다.

`c:\Users\hitea\Desktop\Cursor\ax-office-tools`

원격 주소가 생긴 뒤에 받으려면, 그 주소로 아래를 실행합니다.

```powershell
git clone <저장소 주소>
git pull
```

주소가 생기기 전에는 위 폴더를 그대로 보면 됩니다.

## 볼 문서

| 문서 | 내용 |
| --- | --- |
| README.md | 실행, 샘플 계정, 되는 일과 연결하지 않은 일 |
| docs/screens.md | 메뉴와 화면 문구 |
| docs/test-report.md | 테스트 결과 |
| docs/design.md | 설계. 앱 화면과 다를 수 있으니, 지금 동작은 README와 screens.md를 기준으로 합니다. |

코드는 `src/` 입니다. 로컬 데이터베이스와 비밀키는 `.data/`, `.env`에 있으며 저장소에 넣지 않습니다.

## 화면 켜기

```powershell
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 3000번을 쓸 수 없으면 `npm run dev -- --port 3456` 후 http://localhost:3456 입니다.

- 직원: 김민지, staff@example.com, 비밀번호 없음
- 관리자: 박관리, admin@example.com, 비밀번호 없음

관리자 메뉴는 IT helpdesk, 회의실 관리, IT helpdesk 현황만 있습니다.
