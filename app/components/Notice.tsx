/** 状態表示（エラー・要確認・お知らせ）の共通部品。色は左の太線と見出し語でも区別できる。 */
export type NoticeTone = "error" | "warn" | "info";

const STYLE: Record<NoticeTone, { box: string; label: string; text: string }> = {
  error: { box: "border-danger-line border-l-danger bg-danger-soft text-danger", label: "エラー", text: "text-ink" },
  warn: { box: "border-warn-line border-l-warn bg-warn-soft text-warn", label: "要確認", text: "text-ink" },
  info: { box: "border-line border-l-accent bg-paper text-accent", label: "結果", text: "text-ink" },
};

export default function Notice({
  tone,
  onClose,
  children,
  className = "",
}: {
  tone: NoticeTone;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const s = STYLE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded border border-l-4 px-3 py-2 text-xs leading-relaxed ${s.box} ${className}`}
    >
      <p className={`min-w-0 flex-1 ${s.text}`}>
        <strong className="mr-2 font-bold">{s.label}</strong>
        {children}
      </p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="shrink-0 rounded px-1 text-base leading-none text-ink-sub hover:text-ink"
        >
          ×
        </button>
      )}
    </div>
  );
}
