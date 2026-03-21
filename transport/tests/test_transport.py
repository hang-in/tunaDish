"""Tests for TunadishTransport — WebSocket 전송 로직 검증."""

from __future__ import annotations

import json
import logging

import pytest

from tunapi.transport import MessageRef, RenderedMessage, SendOptions
from tunadish_transport.transport import TunadishTransport


# ---------------------------------------------------------------------------
# Test double
# ---------------------------------------------------------------------------


class MockWs:
    """WebSocket 대역 — send() 호출 기록 및 선택적 예외 주입."""

    def __init__(self, *, raise_on_send: Exception | None = None) -> None:
        self.sent: list[str] = []
        self._raise = raise_on_send

    async def send(self, data: str) -> None:
        if self._raise is not None:
            raise self._raise
        self.sent.append(data)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _last_payload(ws: MockWs) -> dict:
    """마지막으로 전송된 메시지를 JSON 파싱해 반환."""
    assert ws.sent, "ws.send() was not called"
    return json.loads(ws.sent[-1])


# ---------------------------------------------------------------------------
# send()
# ---------------------------------------------------------------------------


async def test_send_json_structure() -> None:
    """send() 호출 시 method='message.new', ref, message 필드를 포함한 JSON을 전송한다."""
    ws = MockWs()
    transport = TunadishTransport(ws)

    await transport.send(channel_id="ch-1", message=RenderedMessage(text="hello"))

    payload = _last_payload(ws)
    assert payload["method"] == "message.new"
    params = payload["params"]
    assert params["ref"]["channel_id"] == "ch-1"
    assert "message_id" in params["ref"]
    assert params["message"]["text"] == "hello"


async def test_send_returns_message_ref() -> None:
    """send() 반환값은 MessageRef이고 channel_id가 입력과 일치한다."""
    ws = MockWs()
    transport = TunadishTransport(ws)

    ref = await transport.send(channel_id="ch-42", message=RenderedMessage(text="hi"))

    assert isinstance(ref, MessageRef)
    assert ref.channel_id == "ch-42"


async def test_send_message_id_is_unique() -> None:
    """연속 send() 호출은 서로 다른 message_id를 생성한다."""
    ws = MockWs()
    transport = TunadishTransport(ws)

    ref_a = await transport.send(channel_id="ch-1", message=RenderedMessage(text="a"))
    ref_b = await transport.send(channel_id="ch-1", message=RenderedMessage(text="b"))

    assert ref_a is not None
    assert ref_b is not None
    assert ref_a.message_id != ref_b.message_id


# ---------------------------------------------------------------------------
# edit()
# ---------------------------------------------------------------------------


async def test_edit_json_structure() -> None:
    """edit() 호출 시 method='message.update'와 전달한 ref가 그대로 직렬화된다."""
    ws = MockWs()
    transport = TunadishTransport(ws)
    ref = MessageRef(channel_id="ch-1", message_id="msg-abc")

    await transport.edit(ref=ref, message=RenderedMessage(text="edited"))

    payload = _last_payload(ws)
    assert payload["method"] == "message.update"
    params = payload["params"]
    assert params["ref"]["channel_id"] == "ch-1"
    assert params["ref"]["message_id"] == "msg-abc"
    assert params["message"]["text"] == "edited"


async def test_edit_returns_same_ref() -> None:
    """edit() 반환값은 입력으로 넘긴 ref와 동일한 객체다."""
    ws = MockWs()
    transport = TunadishTransport(ws)
    ref = MessageRef(channel_id="ch-1", message_id="msg-xyz")

    result = await transport.edit(ref=ref, message=RenderedMessage(text="v2"))

    assert result is ref


# ---------------------------------------------------------------------------
# delete()
# ---------------------------------------------------------------------------


async def test_delete_json_structure() -> None:
    """delete() 호출 시 method='message.delete'와 ref가 포함된 JSON을 전송한다."""
    ws = MockWs()
    transport = TunadishTransport(ws)
    ref = MessageRef(channel_id="ch-1", message_id="msg-del")

    await transport.delete(ref=ref)

    payload = _last_payload(ws)
    assert payload["method"] == "message.delete"
    assert payload["params"]["ref"]["message_id"] == "msg-del"


async def test_delete_returns_true() -> None:
    """delete()는 항상 True를 반환한다."""
    ws = MockWs()
    transport = TunadishTransport(ws)
    ref = MessageRef(channel_id="ch-1", message_id="msg-del")

    result = await transport.delete(ref=ref)

    assert result is True


# ---------------------------------------------------------------------------
# close()
# ---------------------------------------------------------------------------


async def test_close_is_noop() -> None:
    """close()는 예외 없이 정상 완료되어야 한다."""
    ws = MockWs()
    transport = TunadishTransport(ws)

    # 예외가 전파되지 않으면 테스트 통과
    await transport.close()


# ---------------------------------------------------------------------------
# 오류 처리
# ---------------------------------------------------------------------------


async def test_send_ws_error_logs_and_does_not_propagate(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """ws.send()가 예외를 던져도 TunadishTransport.send()는 예외를 전파하지 않는다."""
    ws = MockWs(raise_on_send=RuntimeError("connection closed"))
    transport = TunadishTransport(ws)

    with caplog.at_level(logging.ERROR, logger="tunadish_transport.transport"):
        ref = await transport.send(channel_id="ch-1", message=RenderedMessage(text="x"))

    # 반환값은 None이 아닌 MessageRef(에러 전 생성됨)
    assert ref is not None
    assert any("connection closed" in r.message for r in caplog.records)
