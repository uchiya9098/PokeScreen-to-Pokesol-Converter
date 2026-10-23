"use client";

import Notice from "./Notice";

export type CopyState = "idle" | "copied" | "failed";

interface OutputPanelProps {
  text: string;
  warnings: string[];
  onCopy: () => void;
  copyState: CopyState;
  /** コピーボタンの文言（例: 「6匹分をまとめてコピー」）。省略時は既定の文言 */
  copyLabel?: string;
}

export default function OutputPanel({
  text,
  warnings,
  onCopy,
  copyState,
  copyLabel = "クリップボードにコピー",
}: OutputPanelProps) {
  const empty = text.length === 0;
  // 行数に合わせて高さを調整（長くなりすぎないよう上限を設け、超えた分はスクロール）
  const rows = Math.min(18, Math.max(8, text.split("\n").length + 1));

  return (
    <div className="space-y-3">
      <textarea
        readOnly
        value={text}
        placeholder="ポケモン名を入力すると、ここにポケソル用テキストが表示されます。"
        rows={rows}
        spellCheck={false}
        aria-label="ポケソルテキスト"
        className="w-full resize-y rounded border border-line bg-paper p-3 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {warnings.length > 0 && (
        <Notice tone="warn">
          出力前に次の点を確認してください。
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCopy} disabled={empty} className="btn-primary">
          {copyState === "copied" ? "コピーしました" : copyLabel}
        </button>
        <a
          href="https://pokesol.app/teams"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          ポケソルを開く（別タブ）
        </a>
      </div>

      <p role="status" aria-live="polite" className="min-h-4 text-xs text-danger">
        {copyState === "failed"
          ? "コピーに失敗しました。上のテキストを選択して手動でコピーしてください。"
          : ""}
      </p>
    </div>
  );
}
