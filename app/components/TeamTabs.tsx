"use client";

import { MAX_TEAM_SIZE } from "@/lib/types";

interface TeamTabsProps {
  /** 各タブに表示するポケモン名（未入力は空文字） */
  names: string[];
  active: number;
  /** 警告のあるスロット（「要確認」を表示） */
  flaggedSlots: ReadonlySet<number>;
  disabled?: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/** 「ポケモン1」〜「ポケモン6」の切り替えタブ */
export default function TeamTabs({
  names,
  active,
  flaggedSlots,
  disabled = false,
  onSelect,
  onAdd,
  onRemove,
}: TeamTabsProps) {
  const canAdd = names.length < MAX_TEAM_SIZE;
  const canRemove = names.length > 1;

  return (
    <div className="mb-5">
      <div role="tablist" aria-label="ポケモンの切り替え" className="flex flex-wrap gap-2">
        {names.map((name, i) => {
          const selected = i === active;
          return (
            <button
              key={i}
              role="tab"
              type="button"
              id={`pokemon-tab-${i}`}
              aria-selected={selected}
              aria-controls="pokemon-panel"
              disabled={disabled}
              onClick={() => onSelect(i)}
              className={`flex min-w-[5.5rem] flex-col items-start rounded border px-3 py-1.5 text-left transition-colors disabled:opacity-50 ${
                selected
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line bg-white text-ink-sub hover:border-ink-faint hover:text-ink"
              }`}
            >
              <span className="text-[11px]">ポケモン{i + 1}</span>
              <span className="max-w-[7rem] truncate text-sm font-medium">
                {name || "（未入力）"}
              </span>
              {flaggedSlots.has(i) && (
                <span className="text-[11px] font-bold text-warn">要確認</span>
              )}
            </button>
          );
        })}

        {canAdd && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className="rounded border border-dashed border-ink-faint px-3 py-1.5 text-sm text-ink-sub transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
          >
            ポケモンを追加
          </button>
        )}
      </div>

      {canRemove && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(active)}
            className="text-xs text-danger underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            ポケモン{active + 1}を削除
          </button>
        </div>
      )}
    </div>
  );
}
