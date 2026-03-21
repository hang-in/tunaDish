# Sprint 0 완료 보고서

> 작성일: 2026-03-20

## 1. 구현 목표
tunaDish의 전반적인 모노레포 구조를 생성하고, 클라이언트(React+Tauri)와 Transport(Python 백엔드)의 기본 뼈대를 스캐폴딩하는 것이 목적이었습니다.

## 2. 작업 내역
1. **클라이언트 스캐폴딩 (`client/`)**
   - `create-tauri-app`을 활용하여 React + TypeScript 기반 환경 구성
   - Tailwind CSS v4 최신 설정 및 `shadcn/ui` 초기화 (초기화 오류 해결 및 기본 Button 컴포넌트 추가 확인)
   - Zustand, React-Markdown 등 필수 의존성 패키지 설치
   - 모바일(Android) 빌드 지원 초기화 (`npm run tauri android init`) (참고: NDK 설정 이슈는 데스크탑 구현 우선 진행에 따라 지연 처리함)
2. **Python Transport 패키지 설정 (`transport/`)**
   - `tunadish_transport` 모듈 생성
   - `TunadishBackend`의 최소 인터페이스 뼈대(`backend.py`) 작성
   - `pyproject.toml` 작성 및 `tunapi.transport_backends` 엔트리포인트 등록
3. **개발 환경 연결 확인**
   - 데스크탑 Dev Server 정상 구동 확인 (`npm run tauri dev`)
   - `pip install -e transport` 및 로컬 `tunapi` 패키지 연동 테스트 완료

## 3. 다음 단계
Sprint 1에서는 Python Transport 코어 인터페이스를 구현합니다.
- WebSocket 서버 구동 (`build_and_run`)
- `TunadishTransport` 프로토콜 기반 메시지 전파(send, edit, delete)
- `TunadishPresenter`를 통한 마크다운 렌더링
- Run 실행(`chat.send`) 및 취소(`run.cancel`) 처리 구조 확립
