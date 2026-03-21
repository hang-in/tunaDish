# tunapi 브랜치/RT 스키마 변경 프롬프트

> 대상 레포: `~/privateProject/tunapi/`
> 설계 문서: `~/privateProject/tunaDish/docs/prompts/branch-and-rt-implementation.md`
> 동시 작업: tunaDish transport/client (별도 레포, 충돌 없음)

---

## 목표

RT 토론 합의에 따라 5개 엔티티의 스키마를 확장한다.
기존 데이터와의 하위호환을 유지하면서 필드만 추가한다.

---

## 변경 파일 및 내용

### 1. `src/tunapi/core/conversation_branch.py`

```python
# 변경 전
ConvBranchStatus = Literal["active", "merged", "discarded"]

# 변경 후
ConvBranchStatus = Literal["active", "adopted", "archived", "discarded"]
```

`ConversationBranch` struct에 필드 추가:
```python
checkpoint_id: str | None = None    # 분기 시점의 메시지/utterance ID
rt_session_id: str | None = None    # RT 세션 연결 (None이면 일반 브랜치)
```

**마이그레이션**: 기존 `"merged"` 상태 데이터가 있으면 `"adopted"`로 읽도록 호환 처리.
`forbid_unknown_fields=False`이므로 새 필드 추가는 안전.

### 2. `src/tunapi/core/rt_participant.py`

`RoundtableParticipant` struct에 필드 추가:
```python
model_override: str | None = None   # 엔진 내 특정 모델 지정
```

### 3. `src/tunapi/core/rt_utterance.py`

상단에 Phase 타입 추가:
```python
Phase = Literal["opinion", "comment", "synthesis", "refinement"]
```

`Utterance` struct에 필드 추가:
```python
round_idx: int = 0          # 라운드 번호
phase: Phase = "opinion"    # 구조화된 phase
branch_id: str | None = None  # 브랜치 연결
```

기존 `stage: str` 필드는 유지 (하위호환 + display용).

### 4. `src/tunapi/core/synthesis.py`

`SynthesisArtifact` struct에 필드 추가:
```python
round_idx: int = 0
status: Literal["draft", "finalized", "adopted"] = "draft"
```

---

## 검증

- 기존 테스트가 있으면 통과 확인
- 기존 JSON 파일(`~/.tunapi/project_memory/`)을 로드할 때 에러 없이 새 필드가 기본값으로 채워지는지 확인
- `"merged"` → `"adopted"` 마이그레이션은 store의 load 시점에서 처리

---

## 하지 않는 것

- API 인터페이스 변경 (메서드 시그니처는 그대로)
- 기존 RT 실행 로직 변경
- tunaDish 관련 파일 수정 (별도 레포에서 병렬 진행)
