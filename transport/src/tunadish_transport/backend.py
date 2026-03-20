import json
import logging
import anyio
import websockets
from pathlib import Path
from typing import Any
from functools import partial

from tunapi.transport import MessageRef, RenderedMessage, SendOptions
from tunapi.runner_bridge import handle_message, RunningTask, ExecBridgeConfig, IncomingMessage
from tunapi.transport_runtime import TransportRuntime
from tunapi.api import set_run_base_dir, reset_run_base_dir

from .transport import TunadishTransport
from .presenter import TunadishPresenter
from .context_store import ConversationContextStore

logger = logging.getLogger(__name__)

class TunadishBackend:
    id = "tunadish"
    description = "Tunadish WebSocket Transport"

    def __init__(self):
        self._conv_locks: dict[str, anyio.Lock] = {}
        self.run_map: dict[str, MessageRef] = {}
        self.running_tasks: dict[MessageRef, RunningTask] = {}
        
        # ctx_path = Path.home() / ".tunapi" / "tunadish_context.json" # This line is removed as context_store is initialized later
        # self.context_store = ConversationContextStore(ctx_path) # This line is removed as context_store is initialized later
        self.presenter = TunadishPresenter()

    def check_setup(self, engine_backend: Any, *, transport_override: str | None = None) -> Any:
        try:
            from tunapi.transports import SetupResult
            return SetupResult(issues=[], config_path=Path("."))
        except ImportError:
            class DummyResult:
                issues = []
                ok = True
            return DummyResult()

    async def interactive_setup(self, *, force: bool = False) -> bool:
        return True

    def lock_token(self, *, transport_config: dict[str, Any], _config_path: Any) -> str | None:
        return None

    def build_and_run(
        self,
        *,
        transport_config: dict[str, Any],
        config_path: Any,
        runtime: TransportRuntime,
        final_notify: bool,
        default_engine_override: str | None,
    ) -> None:
        ctx_path = Path.home() / ".tunapi" / "tunadish_context.json"
        self.context_store = ConversationContextStore(ctx_path)
        
        async def main():
            port = transport_config.get("port", 8765)
            logger.info("Starting tunadish websocket server on ws://127.0.0.1:%s", port)
            async with websockets.serve(partial(self._ws_handler, runtime, final_notify), "127.0.0.1", port):
                await anyio.sleep_forever()
        
        anyio.run(main)

    async def _ws_handler(self, runtime: TransportRuntime, final_notify: bool, websocket):
        # WebSocket 연결마다 자체 Transport 인스턴스 생성
        transport = TunadishTransport(websocket)
        
        async for message in websocket:
            try:
                data = json.loads(message)
                method = data.get("method")
                params = data.get("params", {})
                
                if method == "chat.send":
                    anyio.start_soon(self.handle_chat_send, params, runtime, transport)
                elif method == "run.cancel":
                    await self.handle_run_cancel(params, websocket)
                elif method == "project.list":
                    # Send projects list
                    projects = list(runtime.project_aliases())
                    await transport._send_notification("project.list.result", {"projects": projects})
                elif method == "conversation.create":
                    conv_id = params.get("conversation_id")
                    project = params.get("project")
                    if conv_id and project:
                        from tunapi.context import RunContext
                        await self.context_store.set_context(conv_id, RunContext(project=project))
                        await transport._send_notification("conversation.created", {"conversation_id": conv_id, "project": project})
                else:
                    logger.warning("Unknown JSON-RPC method: %s", method)
            except Exception as e:
                logger.error("Error handling websocket message: %s", e)

    async def handle_chat_send(self, params: dict[str, Any], runtime: TransportRuntime, transport: TunadishTransport):
        conv_id = params.get("conversation_id")
        text = params.get("text", "")
        if not conv_id:
            logger.error("chat.send missing conversation_id")
            return

        lock = self._conv_locks.setdefault(conv_id, anyio.Lock())
        if lock.locked():
            logger.warning("Run already in progress for conversation %s", conv_id)
            # Send error back via WS is possible, but we skip for MVP simplicity
            return
            
        async with lock:
            await self._execute_run(conv_id, text, runtime, transport)

    async def _execute_run(self, conv_id: str, text: str, runtime: TransportRuntime, transport: TunadishTransport):
        # 1. progress placeholder 선할당
        progress_ref = await transport.send(
            channel_id=conv_id,
            message=RenderedMessage(text="⏳ starting..."),
            options=SendOptions(notify=False),
        )

        # 2. run_map 등록
        running_task = RunningTask()
        if progress_ref is not None:
            self.running_tasks[progress_ref] = running_task
            self.run_map[conv_id] = progress_ref

        run_base_token = None
        try:
            # 3. context + cwd 해석
            ambient_ctx = await self.context_store.get_context(conv_id)
            resolved = runtime.resolve_message(
                text=text,
                reply_text=None,
                ambient_context=ambient_ctx,
            )
            
            rr = runtime.resolve_runner(
                resume_token=resolved.resume_token,
                engine_override=resolved.engine_override,
            )
            
            cwd = runtime.resolve_run_cwd(resolved.context)
            run_base_token = set_run_base_dir(cwd)

            # 4. handle_message 실행
            cfg = ExecBridgeConfig(
                transport=transport,
                presenter=self.presenter,
                final_notify=False,
            )
            
            incoming = IncomingMessage(
                channel_id=conv_id,
                message_id=progress_ref.message_id if progress_ref else "tmp_id",
                text=text,
            )

            await handle_message(
                cfg=cfg,
                runner=rr.runner,
                incoming=incoming,
                resume_token=resolved.resume_token,
                context=resolved.context,
                running_tasks=self.running_tasks,
                progress_ref=progress_ref,
            )
        except Exception as e:
            logger.exception("Error during _execute_run")
            if progress_ref:
                await transport.edit(ref=progress_ref, message=RenderedMessage(text=f"**❌ 오류 발생:** {e}"))
        finally:
            if run_base_token is not None:
                reset_run_base_dir(run_base_token)
            self.run_map.pop(conv_id, None)

    async def handle_run_cancel(self, params: dict[str, Any], websocket):
        conv_id = params.get("conversation_id")
        progress_ref = self.run_map.get(conv_id)
        if progress_ref is None:
            logger.warning("Cancel requested but no active run for %s", conv_id)
            return

        task = self.running_tasks.get(progress_ref)
        if task is not None:
            task.cancel_requested.set()
            logger.info("Cancelled run for conversation %s", conv_id)

BACKEND = TunadishBackend()
