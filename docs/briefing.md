# tunadish — Claude Code 브리핑 문서

> 버전: 0.2
> 작성일: 2026-03-20
> 목적: 레포 초기 세팅 및 구현 플랜 수립

---

## 1. 프로젝트 배경

### tunapi란
- Mattermost/Slack/Telegram ↔ AI CLI(claude, gemini, codex) 브릿지 프로젝트
- Python 기반, 현재 Slack 트랜스포트 개발 중
- CLI를 채팅앱에서 제어하는 구조

### tunadish 탄생 배경
- AI 에이전트와만 채팅하는데 Mattermost 같은 범용 채팅앱 백엔드가 과함
- 새 트랜스포트를 기존 채팅앱에 추가하는 것도 번거로움
- 결론: AI 채팅 전용 경량 클라이언트를 직접 만들자

### tunapi와의 관계
- tunadish는 tunapi의 transport 플러그인으로 동작
- tunapi 코드 수정 없이 Python entry_point 등록만으로 연결
- 별도 레포로 관리 (기술스택이 다르고 릴리즈 사이클도 독립적)

### tunapi transport 플러그인 등록 방식
```toml
# pyproject.toml
[project.entry-points."tunapi.transport_backends"]
tunadish = "tunadish_transport:TunadishBackend"
```

구현해야 할 인터페이스:
- Transport: send(), edit(), delete(), close()
- Presenter: render_progress(), render_final()
- TransportBackend: check_setup(), build_and_run(), lock_token()

tunapi 메시지 파이프라인:
```
CLI stdout (JSONL)
  -> TunapiEvent
  -> ProgressState
  -> RenderedMessage
  -> Transport.send/edit()
```
- 스트리밍: 토큰 단위 아님, 이벤트 단위 + 5초 주기 배치 업데이트
- 오케스트레이터: runner_bridge.py:handle_message()

### 미래 방향
- tunapi Slack 트랜스포트 완료 후 대규모 리팩토링 예정
- 공통 코어는 tunapi-core로 분리될 수 있음
- tunadish는 이후 tunapi-core 의존성으로 교체 예정
- 지금은 tunapi를 설치된 패키지로 참조하는 것으로 충분

---

## 2. 기술 스택 (확정)

| 영역 | 기술 | 결정 이유 |
|---|---|---|
| 클라이언트 UI | React + TypeScript | Claude Code AI 코드 생성 품질 최우수, 생태계 풍부 |
| 컴포넌트 라이브러리 | shadcn/ui | Tauri + React 조합에서 가장 검증됨 |
| 상태 관리 | Zustand | 가볍고 Claude Code 친화적 |
| 데스크탑/모바일 | Tauri | Electron 사용 금지 |
| 백엔드 (transport) | Python | tunapi와 동일 언어 |
| 프로토콜 | WebSocket + JSON-RPC 2.0 | 실시간 양방향, 요청/응답+이벤트 혼합 |

Electron 절대 사용 금지

---

## 3. 지원 플랫폼

- Windows / macOS / Linux (데스크탑)
- Android (모바일, iOS 제외)
- 터미널 환경(AI CLI가 돌아가는 곳)이면 어디서든 설치/설정이 쉬워야 함

---

## 4. 레포 구조 (확정)

모노레포 — 클라이언트 + Python transport 같은 레포:

```
tunadish/
  ├─ client/                # Tauri + React 클라이언트
  │   ├─ src/
  │   ├─ src-tauri/
  │   └─ package.json
  ├─ transport/             # Python tunapi 플러그인
  │   ├─ src/
  │   │   └─ tunadish_transport/
  │   └─ pyproject.toml
  ├─ docs/
  │   └─ prd.md
  └─ README.md
```

---

## 5. MVP 범위 (확정)

### Phase 1 (MVP) — 포함

| 기능 | 내용 |
|---|---|
| 프로젝트 관리 | 생성/목록/선택, 에이전트 바인딩 |
| 채팅 | AI 전용, 프로젝트별 독립 공간, 마크다운 렌더링 |
| 에이전트 연결 | tunapi transport 통해 claude/gemini/codex 연결 |
| 에이전트 제어 | 실행/종료/재시작 |
| 입력창 기본기 | 마크다운, 파일첨부, / 커맨드, ! 커맨드 |

### Phase 2+ — 제외

| 기능 | 제외 이유 |
|---|---|
| 브랜치/merge | 컨텍스트 윈도우 문제, 설계 미완 |
| 토론 모드 | 브랜치 위에 올라가는 기능 |
| 페르소나 | Phase 2 초반 추가 |
| 스킬 | 페르소나 이후 |
| 스니펫 | 입력창 안정화 후 |
| 컨텍스트 고도화 | tunapi 작업 완료 후 |

---

## 6. JSON-RPC 2.0 프로토콜 스펙 (MVP 기준)

### 클라이언트 → transport (Request)

| method | 설명 | 주요 params |
|---|---|---|
| project.list | 프로젝트 목록 조회 | - |
| project.create | 프로젝트 생성 | name, path |
| project.get | 프로젝트 상세 | project_id |
| agent.start | 에이전트 실행 | project_id, engine |
| agent.stop | 에이전트 종료 | project_id, engine |
| agent.restart | 에이전트 재시작 | project_id, engine |
| message.send | 메시지 전송 | project_id, engine, text, files? |
| session.new | 세션 초기화 | project_id, engine |
| session.resume | 세션 재개 | project_id, engine |

### transport → 클라이언트 (Notification)

| method | 설명 | 주요 params |
|---|---|---|
| agent.event | 에이전트 진행 중 이벤트 | project_id, engine, event |
| agent.response | 최종 응답 완료 | project_id, engine, text, usage |
| agent.status | 에이전트 상태 변경 | project_id, engine, status |
| agent.error | 에러 발생 | project_id, engine, message |

### 에이전트 status 값

idle / running / stopped / error

---

## 7. UI/UX

### 디자인 레퍼런스
- 구조: Slack / Mattermost (사이드바 + 채팅 패널)
- 대화 스타일: Claude.ai (문서형, 마크다운, 버블 아님)

### 데스크탑 레이아웃
```
+----------+----------------------+-------------+
| 사이드바  | 채팅 메인             | 컨텍스트 패널 |
|          |                      |             |
| 프로젝트  | [브랜치 탭]           | 현재 프로젝트 |
|  └ main  |                      | 에이전트 상태 |
|  └ 브랜치 | 대화 영역            | 페르소나     |
|  └ 브랜치 |                      | 스킬        |
|          |                      |             |
| 설정      | [입력창]              |             |
+----------+----------------------+-------------+
```

### 모바일 레이아웃
- 사이드바: 스와이프 or 햄버거 메뉴
- 컨텍스트 패널: 하단 시트
- 기본 상태: 채팅 영역만 표시

### 패널 토글
- 좌측 사이드바 / 우측 컨텍스트 패널: 모두 토글 가능
- 기본(데스크탑): 둘 다 열림
- 좁은 창 / 모바일: 닫아서 채팅 집중

---

## 8. tunapi 내부 구조 참고

### 엔진별 차이

| 엔진 | stdin | 재개 방식 |
|---|---|---|
| Claude | None (arg로 전달) | --resume TOKEN |
| Codex | 프롬프트를 stdin으로 | resume TOKEN - |
| Gemini | None | --resume TOKEN |

### 세션/컨텍스트
- ChatSessionStore: ~/.tunapi/mattermost_sessions.json
- channel_id → engine_id → ResumeToken 구조
- tunadish는 전용 세션 파일 분리 필요 (예: ~/.tunapi/tunadish_sessions.json)

### 토론 모드 현황
- mattermost/roundtable.py — Mattermost에 종속
- Phase 2 구현 시 재구현 필요 (tunapi 리팩토링 후 core 추출 예정)

---

## 9. 레포 세팅 요청사항

아래 순서로 초기 세팅 및 구현 플랜을 수립해줘.

### 9.1 레포 구조 검토
- 4절의 모노레포 구조 적합성 검토 및 개선 제안

### 9.2 클라이언트 스캐폴딩
- npm create tauri-app@latest client 기반
- React + TypeScript, shadcn/ui + Zustand 설치 및 초기 설정
- Android 빌드 설정 포함

### 9.3 Python transport 패키지 구조
- tunapi Transport/Presenter/TransportBackend 인터페이스 구현 골격
- WebSocket 서버 (JSON-RPC 2.0) 기본 구조 (6절 스펙 기준)
- pyproject.toml entry_point 등록

### 9.4 구현 플랜
- Phase 1 (MVP) 기준 구현 순서 제안
- 기술적 리스크 항목 파악

---

## 10. 미결 사항

- [ ] 모바일 접속 시 인증 / TLS 방식
- [ ] 컨텍스트 저장 방식 구체화 (tunapi 고도화 완료 후)
- [ ] 브랜치/merge 컨텍스트 윈도우 문제 해결 방안
- [ ] 토론 모드 core 추출 타이밍 (tunapi 리팩토링 연계)
- [ ] 브랜치 checkout (과거 분기점 재탐색) 구현 방식
- [ ] 모바일 에이전트 제어 UX
- [ ] 설치/설정 방식 (패키지 배포 전략)
