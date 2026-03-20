from typing import Any

class TunadishBackend:
    id = "tunadish"

    def check_setup(self, engine_backend: Any, *, transport_override: dict | None = None) -> Any:
        pass

    async def interactive_setup(self, *, force: bool = False) -> bool:
        return True

    def lock_token(self, *, transport_config: dict[str, Any], _config_path: Any) -> str | None:
        return None

    def build_and_run(self, *, transport_config: dict[str, Any], config_path: Any, runtime: Any, **kwargs) -> None:
        print("tunadish transport initialized!")
