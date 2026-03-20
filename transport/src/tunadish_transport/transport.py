from typing import Any
from tunapi.transport import (
    Transport,
    MessageRef,
    SendOptions,
    RenderedMessage
)
from anyio.abc import ObjectSendStream
from pydantic import BaseModel
import json
import logging

logger = logging.getLogger(__name__)

class NotificationFrame(BaseModel):
    method: str
    params: dict[str, Any]

class TunadishTransport(Transport):
    """
    tunadish 클라이언트로 rendered message를 전파(Relay)하는 Transport 구현체입니다.
    """
    def __init__(self, send_stream: ObjectSendStream[str]):
        self._send_stream = send_stream

    async def _send_notification(self, method: str, params: dict[str, Any]) -> None:
        frame = NotificationFrame(method=method, params=params)
        raw = json.dumps(frame.model_dump(exclude_none=True))
        try:
            await self._send_stream.send(raw)
        except Exception as e:
            logger.error("Failed to push notification to client: %s", e)

    async def send(
        self,
        *,
        channel_id: str,
        message: RenderedMessage,
        options: SendOptions | None = None
    ) -> MessageRef | None:
        """새 메시지를 클라이언트로 푸시"""
        import uuid
        ref_id = str(uuid.uuid4())
        ref = MessageRef(channel_id=channel_id, message_id=ref_id)
        
        await self._send_notification(
            method="message.new",
            params={
                "ref": ref.model_dump(),
                "message": message.model_dump(exclude_none=True),
            }
        )
        return ref

    async def edit(
        self,
        *,
        ref: MessageRef,
        message: RenderedMessage,
        wait: bool = True
    ) -> MessageRef | None:
        """기존 메시지 업데이트(progress 갱신 등)를 클라이언트로 푸시"""
        await self._send_notification(
            method="message.update",
            params={
                "ref": ref.model_dump(),
                "message": message.model_dump(exclude_none=True),
            }
        )
        return ref

    async def delete(self, *, ref: MessageRef) -> bool:
        """메시지 삭제"""
        await self._send_notification(
            method="message.delete",
            params={
                "ref": ref.model_dump(),
            }
        )
        return True

    async def close(self) -> None:
        """연결 종료 처리 필요 시 구현"""
        pass
