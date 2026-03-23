export function EmptyTab({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-[10px] text-on-surface-variant/25">
      {text}
    </div>
  );
}
