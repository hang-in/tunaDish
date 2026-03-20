import json
import json
import anyio
from pathlib import Path
from tunapi.context import RunContext

class ConversationContextStore:
    """
    tunadish 클라이언트의 각 대화(conversation_id)에 연결된 
    환경 컨텍스트(project, branch 등)를 관리합니다.
    """
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self._lock = anyio.Lock()
        self._cache: dict[str, RunContext] = {}
        
        # Load initially if exists
        self._load()

    def _load(self) -> None:
        if not self.storage_path.exists():
            return
        
        try:
            data = json.loads(self.storage_path.read_text("utf-8"))
            for conv_id, ctx_data in data.get("conversations", {}).items():
                self._cache[conv_id] = RunContext(
                    project=ctx_data.get("project"),
                    branch=ctx_data.get("branch")
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Failed to load context store: %s", e)

    async def _save(self) -> None:
        async with self._lock:
            data = {"conversations": {}}
            for conv_id, ctx in self._cache.items():
                data["conversations"][conv_id] = {
                    "project": ctx.project,
                    "branch": ctx.branch
                }
            
            # Ensure parent dict exists
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            self.storage_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")

    async def get_context(self, conv_id: str) -> RunContext | None:
        return self._cache.get(conv_id)

    async def set_context(self, conv_id: str, context: RunContext) -> None:
        self._cache[conv_id] = context
        await self._save()

    async def clear(self, conv_id: str) -> None:
        self._cache.pop(conv_id, None)
        await self._save()
