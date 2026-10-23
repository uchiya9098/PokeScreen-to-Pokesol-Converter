"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { foldKana } from "@/lib/snap";
import TypeBadge from "./TypeBadge";

/**
 * 入力すると候補が絞り込まれ、選ぶと値が入る入力欄（ポケソルの「ポケモンを選択」「技」「持ち物」と同じ使い方）。
 * 候補にない文字も入力できる（AIが読み取った名前をそのまま残すため）。
 */
export interface ComboOption {
  value: string;
  /** 右側に出すタイプのバッジ */
  badges?: readonly string[];
  /** 名前の下に出す補足 */
  hint?: string;
  /** 見出し（同じ見出しの候補をまとめて表示する） */
  group?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboOption[];
  placeholder?: string;
  ariaLabel?: string;
  /** 入力欄に足すクラス（警告の枠など） */
  className?: string;
  /** 入力欄の右に常に出す表示（タイプのバッジなど） */
  trailing?: ReactNode;
  /** 候補が空のときの説明 */
  emptyText?: string;
  /** 値があるとき、右端に「×」（クリア）を出す */
  clearable?: boolean;
}

const MAX_SHOWN = 120;

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className = "",
  trailing,
  emptyText = "候補がありません",
  clearable = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // 入力して絞り込み中か（開いた直後は全候補を出す）
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const shown = useMemo(() => {
    const q = typed ? foldKana(value) : "";
    if (!q) return options.slice(0, MAX_SHOWN);
    const starts: ComboOption[] = [];
    const contains: ComboOption[] = [];
    for (const o of options) {
      const f = foldKana(o.value);
      if (f.startsWith(q)) starts.push(o);
      else if (f.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, MAX_SHOWN);
  }, [options, value, typed]);

  useEffect(() => setActive(0), [shown]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyped(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault();
      choose(shown[active].value);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  };

  let lastGroup: string | undefined;

  return (
    <div ref={wrap} className="relative">
      <input
        className={`field-input ${trailing || (clearable && value) ? "pr-24" : ""} ${className}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setTyped(false);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(e: { target: { value: string } }) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {trailing && <span className="pointer-events-none flex gap-1">{trailing}</span>}
        {clearable && value && (
          <button
            type="button"
            className="rounded px-1.5 text-base leading-none text-ink-sub hover:text-ink"
            onMouseDown={(e: { preventDefault(): void }) => e.preventDefault()}
            onClick={() => {
              choose("");
            }}
            aria-label="クリア"
          >
            ×
          </button>
        )}
      </span>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded border border-ink-faint bg-white py-1"
        >
          {shown.length === 0 && <li className="px-3 py-2 text-xs text-ink-sub">{emptyText}</li>}
          {shown.map((o, i) => {
            const header = o.group !== lastGroup && o.group ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={`${o.group ?? ""}:${o.value}`} role="presentation">
                {header && (
                  <div className="px-3 pb-1 pt-2 text-xs font-bold text-ink-sub">{header}</div>
                )}
                <div
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                    i === active ? "bg-accent-soft text-ink" : "text-ink hover:bg-paper"
                  }`}
                  onMouseDown={(e: { preventDefault(): void }) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.value}</span>
                    {o.hint && <span className="block text-xs text-ink-sub">{o.hint}</span>}
                  </span>
                  {o.badges && (
                    <span className="flex shrink-0 gap-1">
                      {o.badges.map((b) => (
                        <TypeBadge key={b} type={b} />
                      ))}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
