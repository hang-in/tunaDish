from tunapi.progress import ProgressState
from tunapi.runner_bridge import Presenter, RunOutcome
from tunapi.transport import RenderedMessage

class TunadishPresenter(Presenter):
    """
    tunadish UI에 맞게 ProgressState를 Markdown으로 변환하는 책임을 집니다.
    클라이언트는 별도의 구조화 이벤트를 받지 않으므로, 이 렌더링 결과가 UI의 전부가 됩니다.
    """
    
    def render_progress(
        self,
        state: ProgressState,
        *,
        elapsed_s: float,
        label: str,
    ) -> RenderedMessage:
        lines = []
        
        if label:
            lines.append(f"*{label}* ({elapsed_s:.1f}s)")
            
        if state.actions:
            lines.append("")
            lines.append("### 작업 내역")
            for act in state.actions:
                lines.append(f"- `{act.tool_name}`: {act.summary}")
                
        # Cancelled or Error state indicator
        if state.status == "cancelled":
            lines.append("\n**⚠️ 실행이 취소되었습니다.**")
        elif state.status == "error":
            lines.append(f"\n**❌ 오류 발생:**\n```\n{state.error_details}\n```")
            
        text = "\n".join(lines).strip()
        if not text:
            text = "⏳ 진행 중..."
            
        return RenderedMessage(text=text)

    def render_final(
        self,
        state: ProgressState,
        *,
        elapsed_s: float,
        status: str,
        answer: str | None,
    ) -> RenderedMessage:
        if status == "error":
            return RenderedMessage(text=f"**❌ 오류 발생:** {state.error_details}")
        elif status == "cancelled":
            return RenderedMessage(text="**⚠️ 실행이 취소되었습니다.**")
            
        return RenderedMessage(text=answer or "*(응답 없음)*")
