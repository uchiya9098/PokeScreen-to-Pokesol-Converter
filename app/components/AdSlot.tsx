"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSlotProps {
  /** AdSense の広告ユニットのスロットID。未設定ならプレースホルダーを表示 */
  slot?: string;
  /** プレースホルダーに表示する場所の名前 */
  name: string;
  /** 広告の高さの目安（レイアウトのガタつき防止） */
  minHeight?: number;
  className?: string;
}

/**
 * 広告枠。
 * NEXT_PUBLIC_ADSENSE_CLIENT とスロットIDの両方が設定されていれば AdSense を表示し、
 * そうでなければ「広告枠」のプレースホルダーを表示します。
 * AdSense のスクリプト本体は app/layout.tsx で読み込みます。
 */
export default function AdSlot({ slot, name, minHeight = 250, className = "" }: AdSlotProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const enabled = Boolean(client && slot);
  const pushed = useRef(false);

  useEffect(() => {
    if (!enabled || pushed.current) return;
    pushed.current = true; // StrictMode の二重実行で push が重複しないように
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // 広告ブロッカー等で失敗しても、アプリ本体の動作には影響させない
    }
  }, [enabled]);

  return (
    <aside aria-label="広告" className={className}>
      <p className="mb-1 text-[11px] text-ink-faint">広告</p>
      {enabled ? (
        <ins
          className="adsbygoogle block overflow-hidden"
          style={{ display: "block", minHeight }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div
          style={{ minHeight }}
          className="flex flex-col items-center justify-center rounded border border-dashed border-line bg-white px-3 text-center"
        >
          <span className="text-xs font-medium text-ink-sub">広告枠（{name}）</span>
          <span className="mt-1 text-[11px] text-ink-faint">
            .env に AdSense の ID を設定すると広告が表示されます
          </span>
        </div>
      )}
    </aside>
  );
}
