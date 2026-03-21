"""Shared pytest fixtures for tunadish transport tests."""

from pathlib import Path

import pytest

from tunapi.context import RunContext
from tunapi.model import Action
from tunapi.progress import ActionState, ProgressState

from tunadish_transport.context_store import ConversationContextStore


# ---------------------------------------------------------------------------
# ProgressState fixtures
# ---------------------------------------------------------------------------


def _make_action_state(
    title: str,
    *,
    completed: bool = False,
    action_id: str = "act-1",
    kind: str = "tool",
    seq: int = 1,
) -> ActionState:
    """Build a minimal ActionState for use in tests."""
    action = Action(id=action_id, kind=kind, title=title)
    return ActionState(
        action=action,
        phase="completed" if completed else "started",
        ok=True if completed else None,
        display_phase="completed" if completed else "started",
        completed=completed,
        first_seen=seq,
        last_update=seq,
    )


@pytest.fixture()
def empty_state() -> ProgressState:
    """ProgressState with no actions."""
    return ProgressState(
        engine="claude",
        action_count=0,
        actions=(),
        resume=None,
        resume_line=None,
        context_line=None,
    )


@pytest.fixture()
def state_with_actions() -> ProgressState:
    """ProgressState with one completed and one in-progress action."""
    actions = (
        _make_action_state("Read file", completed=True, action_id="act-1", seq=1),
        _make_action_state("Write output", completed=False, action_id="act-2", seq=2),
    )
    return ProgressState(
        engine="claude",
        action_count=2,
        actions=actions,
        resume=None,
        resume_line=None,
        context_line=None,
    )


# ---------------------------------------------------------------------------
# ConversationContextStore fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def store(tmp_path: Path) -> ConversationContextStore:
    """ConversationContextStore backed by a temporary file."""
    storage_file = tmp_path / "context_store.json"
    return ConversationContextStore(storage_file)


@pytest.fixture()
def sample_context() -> RunContext:
    """A reusable RunContext for testing."""
    return RunContext(project="my-project", branch="main")
