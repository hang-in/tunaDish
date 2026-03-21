"""Tests for tunadish_transport.commands — _resolve_id 및 dispatch_command 라우팅 검증."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from tunadish_transport.commands import _resolve_id, dispatch_command


# ---------------------------------------------------------------------------
# Test doubles — _resolve_id
# ---------------------------------------------------------------------------


@dataclass
class _Item:
    """ID/label을 가진 최소 데이터 객체."""

    id: str
    label: str


def _make_fetch(items: list[_Item]):
    """items 리스트를 반환하는 async fetch_all 콜백을 생성한다."""

    async def _fetch() -> list[_Item]:
        return items

    return _fetch


def _get_id(item: _Item) -> str:
    return item.id


def _get_label(item: _Item) -> str:
    return item.label


# ---------------------------------------------------------------------------
# _resolve_id — 정상 경로
# ---------------------------------------------------------------------------


async def test_resolve_id_exact_match() -> None:
    """전달한 prefix가 정확히 일치하는 ID가 있으면 (id, None)을 반환한다."""
    items = [_Item(id="abcdef1234567890", label="entry A")]
    item_id, err = await _resolve_id(
        "abcdef1234567890",
        fetch_all=_make_fetch(items),
        get_id=_get_id,
        get_label=_get_label,
    )
    assert item_id == "abcdef1234567890"
    assert err is None


async def test_resolve_id_prefix_match() -> None:
    """고유한 prefix로 아이템을 찾으면 전체 ID와 None을 반환한다."""
    items = [
        _Item(id="abcdef1234567890", label="entry A"),
        _Item(id="zzzzzzabcdef0000", label="entry B"),
    ]
    item_id, err = await _resolve_id(
        "abcdef",
        fetch_all=_make_fetch(items),
        get_id=_get_id,
        get_label=_get_label,
    )
    assert item_id == "abcdef1234567890"
    assert err is None


# ---------------------------------------------------------------------------
# _resolve_id — 오류 경로
# ---------------------------------------------------------------------------


async def test_resolve_id_too_short() -> None:
    """6자 미만 prefix는 (None, 에러메시지)를 반환한다."""
    item_id, err = await _resolve_id(
        "abc",
        fetch_all=_make_fetch([]),
        get_id=_get_id,
        get_label=_get_label,
    )
    assert item_id is None
    assert err is not None
    assert "minimum 6" in err
    assert "abc" in err


async def test_resolve_id_not_found() -> None:
    """매칭되는 아이템이 없으면 (None, not-found 메시지)를 반환한다."""
    items = [_Item(id="aaaaaa1111111111", label="entry A")]
    item_id, err = await _resolve_id(
        "bbbbbb",
        fetch_all=_make_fetch(items),
        get_id=_get_id,
        get_label=_get_label,
    )
    assert item_id is None
    assert err is not None
    assert "not found" in err


async def test_resolve_id_ambiguous() -> None:
    """여러 아이템이 prefix를 공유하면 (None, 모호함 메시지)를 반환하고 목록을 포함한다."""
    items = [
        _Item(id=f"abcdef{i:010d}", label=f"entry {i}") for i in range(3)
    ]
    item_id, err = await _resolve_id(
        "abcdef",
        fetch_all=_make_fetch(items),
        get_id=_get_id,
        get_label=_get_label,
    )
    assert item_id is None
    assert err is not None
    assert "Ambiguous" in err
    assert "3 matches" in err
    # 각 항목의 ID 앞 16자가 에러 메시지에 포함되어야 한다
    for item in items:
        assert item.id[:16] in err


async def test_resolve_id_ambiguous_truncated() -> None:
    """매칭 아이템이 5개 초과면 '... and N more' 줄이 추가된다."""
    items = [
        _Item(id=f"abcdef{i:010d}", label=f"entry {i}") for i in range(8)
    ]
    item_id, err = await _resolve_id(
        "abcdef",
        fetch_all=_make_fetch(items),
        get_id=_get_id,
        get_label=_get_label,
    )
    assert item_id is None
    assert err is not None
    assert "and 3 more" in err


# ---------------------------------------------------------------------------
# dispatch_command — 라우팅 검증
# ---------------------------------------------------------------------------


def _make_dispatch_deps() -> dict[str, Any]:
    """dispatch_command 호출에 필요한 최소 mock 의존성 딕셔너리를 반환한다."""
    runtime = MagicMock()
    runtime.available_engine_ids.return_value = ["claude"]
    runtime.project_aliases.return_value = []
    runtime.default_engine = "claude"

    send = AsyncMock()

    return {
        "channel_id": "ch-test",
        "runtime": runtime,
        "chat_prefs": None,
        "facade": None,
        "journal": None,
        "context_store": None,
        "running_tasks": {},
        "projects_root": None,
        "config_path": None,
        "send": send,
    }


async def test_dispatch_known_command_returns_true() -> None:
    """알려진 커맨드('help')는 True를 반환한다."""
    deps = _make_dispatch_deps()
    result = await dispatch_command("help", "", **deps)
    assert result is True


async def test_dispatch_known_command_calls_send() -> None:
    """'help' 커맨드 처리 후 send()가 최소 한 번 호출된다."""
    deps = _make_dispatch_deps()
    await dispatch_command("help", "", **deps)
    deps["send"].assert_awaited()


async def test_dispatch_unknown_command_returns_false() -> None:
    """알 수 없는 커맨드는 False를 반환하고 send()를 호출하지 않는다."""
    deps = _make_dispatch_deps()
    result = await dispatch_command("nonexistent", "", **deps)
    assert result is False
    deps["send"].assert_not_awaited()


async def test_dispatch_new_with_no_journal() -> None:
    """'new' 커맨드는 journal=None이어도 예외 없이 처리되고 True를 반환한다."""
    deps = _make_dispatch_deps()
    result = await dispatch_command("new", "", **deps)
    assert result is True
    deps["send"].assert_awaited_once()


async def test_dispatch_status_returns_true() -> None:
    """'status' 커맨드는 True를 반환한다."""
    deps = _make_dispatch_deps()
    result = await dispatch_command("status", "", **deps)
    assert result is True
