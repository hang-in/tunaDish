"""Tests for TunadishPresenter rendering logic."""

import pytest

from tunapi.progress import ProgressState
from tunapi.transport import RenderedMessage

from tunadish_transport.presenter import TunadishPresenter


@pytest.fixture()
def presenter() -> TunadishPresenter:
    return TunadishPresenter()


# ---------------------------------------------------------------------------
# render_progress
# ---------------------------------------------------------------------------


def test_render_progress_empty_actions_shows_label(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """With no actions, output contains the label and elapsed time."""
    result = presenter.render_progress(empty_state, elapsed_s=1.5, label="working")

    assert isinstance(result, RenderedMessage)
    assert "**working**" in result.text
    assert "1.5s" in result.text


def test_render_progress_empty_actions_no_action_bullets(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """With no actions, no bullet lines appear in the output."""
    result = presenter.render_progress(empty_state, elapsed_s=0.0, label="working")

    assert "- " not in result.text


def test_render_progress_with_actions_shows_status_icons(
    presenter: TunadishPresenter,
    state_with_actions: ProgressState,
) -> None:
    """Completed actions show checkmark; in-progress actions show hourglass."""
    result = presenter.render_progress(state_with_actions, elapsed_s=2.0, label="running")

    assert "✅" in result.text  # completed action
    assert "⏳" in result.text  # in-progress action


def test_render_progress_with_actions_shows_titles(
    presenter: TunadishPresenter,
    state_with_actions: ProgressState,
) -> None:
    """Each action title appears in the rendered output."""
    result = presenter.render_progress(state_with_actions, elapsed_s=2.0)

    assert "Read file" in result.text
    assert "Write output" in result.text


def test_render_progress_empty_label_falls_back_to_placeholder(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """When both label is empty and there are no actions, fallback text is returned."""
    result = presenter.render_progress(empty_state, elapsed_s=0.0, label="")

    assert result.text == "⏳ 진행 중..."


# ---------------------------------------------------------------------------
# render_final
# ---------------------------------------------------------------------------


def test_render_final_success_returns_answer(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """Successful completion returns the answer text unchanged."""
    result = presenter.render_final(
        empty_state, elapsed_s=3.0, status="completed", answer="Hello, world!"
    )

    assert result.text == "Hello, world!"


def test_render_final_success_empty_answer_returns_placeholder(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """Empty answer on success returns the no-response placeholder."""
    result = presenter.render_final(
        empty_state, elapsed_s=3.0, status="completed", answer=""
    )

    assert result.text == "*(응답 없음)*"


def test_render_final_error_returns_error_message(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """Error status returns the error indicator regardless of answer content."""
    result = presenter.render_final(
        empty_state, elapsed_s=1.0, status="error", answer="ignored"
    )

    assert "❌" in result.text
    assert "오류 발생" in result.text


def test_render_final_cancelled_returns_cancel_message(
    presenter: TunadishPresenter,
    empty_state: ProgressState,
) -> None:
    """Cancelled status returns the cancellation notice."""
    result = presenter.render_final(
        empty_state, elapsed_s=0.5, status="cancelled", answer=""
    )

    assert "⚠️" in result.text
    assert "취소" in result.text
