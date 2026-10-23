"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdSlot from "./components/AdSlot";
import Notice from "./components/Notice";
import Dropzone, { type UploadedImage } from "./components/Dropzone";
import OutputPanel, { type CopyState } from "./components/OutputPanel";
import PokemonFormFields from "./components/PokemonFormFields";
import TeamTabs from "./components/TeamTabs";
import { toCheckedTeamForms } from "@/lib/calc";
import { summarizeTeam } from "@/lib/extract";
import { SINGLE_SHOT_COMPRESS, compressImage } from "@/lib/image";
import {
  buildTeamText,
  countExportable,
  hasContent,
  validateTeam,
} from "@/lib/pokesol";
import {
  MAX_TEAM_SIZE,
  createEmptyForm,
  type AnalyzeMode,
  type AnalyzeResponse,
  type PokemonForm,
} from "@/lib/types";

/** チーム画面は「能力」「ステータス」の2枚、1匹ずつの画面は1匹1枚で最大6枚 */
const MAX_FILES: Record<AnalyzeMode, number> = { team: 2, single: 6 };

const MODE_LABEL: Record<AnalyzeMode, string> = {
  team: "チーム画面（2枚）",
  single: "1匹ずつ（最大6枚）",
};
const MAX_BYTES = 20 * 1024 * 1024;
/** サーバー側のタイムアウト(50秒)より少し長く待つ */
const CLIENT_TIMEOUT_MS = 58_000;

type Phase = "idle" | "preparing" | "analyzing" | "done";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  preparing: "画像を送信用に縮小しています…",
  analyzing: "AIがスクリーンショットを読み取っています。20〜40秒ほどかかります。このままお待ちください。",
  done: "",
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非HTTPS環境や権限拒否時のフォールバック
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const makeUploaded = (file: File): UploadedImage => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
  file,
  url: URL.createObjectURL(file),
});

/** サーバーへ画像を送り、AnalyzeResponse を返す。通信系の失敗は日本語メッセージの Error で投げる。 */
async function requestAnalysis(
  files: File[],
  mode: AnalyzeMode,
  signal: AbortSignal,
): Promise<AnalyzeResponse> {
  const body = new FormData();
  body.append("mode", mode);
  files.forEach((f) => body.append("images", f, f.name));

  let res: Response;
  try {
    res = await fetch("/api/analyze", { method: "POST", body, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("解析に時間がかかりすぎました。もう一度お試しください。");
    }
    throw new Error("サーバーに接続できませんでした。ネットワークを確認して再度お試しください。");
  }

  try {
    return (await res.json()) as AnalyzeResponse;
  } catch {
    if (res.status === 413) {
      throw new Error("画像のサイズが大きすぎます。別の画像でお試しください。");
    }
    throw new Error(`サーバーから想定外の応答がありました（${res.status}）。`);
  }
}

/** 未取得項目の案内文。全員が同じ項目を欠いている場合は1回にまとめる。 */
function describeMissing(members: ReturnType<typeof summarizeTeam>): string {
  const withMissing = members.filter((m) => m.missing.length > 0);
  if (withMissing.length === 0) return "";
  const first = withMissing[0].missing.join("・");
  if (withMissing.length === members.length && withMissing.every((m) => m.missing.join("・") === first)) {
    return `全員で未取得の項目: ${first}（もう一方の画面を追加するか、手入力してください）。`;
  }
  return `未取得の項目 — ${withMissing
    .map((m) => `ポケモン${m.index}: ${m.missing.join("・")}`)
    .join(" / ")}。`;
}

export default function Home() {
  const [mode, setMode] = useState<AnalyzeMode>("team");
  // 画像は、モードごとに別々に持つ（切り替えても、もう一方の画像は残る）
  const [shots, setShots] = useState<Record<AnalyzeMode, UploadedImage[]>>({ team: [], single: [] });
  const images = shots[mode];
  const setImages = (fn: (prev: UploadedImage[]) => UploadedImage[]) =>
    setShots((p) => ({ ...p, [mode]: fn(p[mode]) }));
  const [team, setTeam] = useState<PokemonForm[]>(() => [createEmptyForm()]);
  const [active, setActive] = useState(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlightEmpty, setHighlightEmpty] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const imagesRef = useRef<UploadedImage[]>([]);
  imagesRef.current = [...shots.team, ...shots.single];
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // アンマウント時に ObjectURL と通信を解放
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url));
      if (copyTimer.current) clearTimeout(copyTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  const busy = phase === "preparing" || phase === "analyzing";
  const safeActive = Math.min(active, team.length - 1);
  const current = team[safeActive];

  const outputText = useMemo(() => buildTeamText(team), [team]);
  const exportCount = useMemo(() => countExportable(team), [team]);
  const issues = useMemo(() => validateTeam(team), [team]);
  const flaggedSlots = useMemo(() => new Set(issues.map((i) => i.index)), [issues]);
  const warnings = useMemo(
    () =>
      issues.flatMap((i) => {
        const name = team[i.index]?.name.trim();
        const label = `ポケモン${i.index + 1}${name ? `（${name}）` : ""}`;
        return i.messages.map((m) => `${label}: ${m}`);
      }),
    [issues, team],
  );

  /* ---------------------------- 画像の追加・削除 ---------------------------- */

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const problems: string[] = [];
    const valid: File[] = [];

    for (const f of incoming) {
      if (!f.type.startsWith("image/")) {
        problems.push(`「${f.name}」は画像ファイルではありません。`);
      } else if (f.size > MAX_BYTES) {
        problems.push(`「${f.name}」は20MBを超えています。`);
      } else {
        valid.push(f);
      }
    }

    const fresh = valid.filter(
      (f) =>
        !images.some(
          (x) =>
            x.file.name === f.name &&
            x.file.size === f.size &&
            x.file.lastModified === f.lastModified,
        ),
    );
    const accepted = fresh.slice(0, Math.max(0, MAX_FILES[mode] - images.length));
    if (fresh.length > accepted.length) {
      problems.push(`画像は最大${MAX_FILES[mode]}枚までです。`);
    }

    if (accepted.length > 0) setImages((prev) => [...prev, ...accepted.map(makeUploaded)]);
    setError(problems.length > 0 ? problems.join(" ") : null);
  };

  const removeImage = (id: string) => {
    const target = images.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setImages((prev) => prev.filter((i) => i.id !== id));
  };

  /* -------------------------------- AI解析 -------------------------------- */

  const handleAnalyze = async () => {
    if (images.length === 0) {
      setError(
        mode === "single"
          ? "画像が選択されていません。ポケモン1匹ずつの画面のスクリーンショットを追加してください。"
          : "画像が選択されていません。チーム画面の「能力」「ステータス」のスクリーンショットを追加してください。",
      );
      return;
    }
    if (
      team.some(hasContent) &&
      !window.confirm("現在の入力内容は、解析結果で置き換えられます。よろしいですか？")
    ) {
      return;
    }

    setError(null);
    setNotice(null);
    setPhase("preparing");

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const compressed = await Promise.all(
        images.map((i) => compressImage(i.file, mode === "single" ? SINGLE_SHOT_COMPRESS : {})),
      );
      setPhase("analyzing");

      const result = await requestAnalysis(compressed, mode, controller.signal);

      if (!result.ok) {
        setError(result.error.message);
        setPhase("idle");
        return;
      }

      if (result.data.length === 0) {
        setError(
          mode === "single"
            ? "画像からポケモンの情報を読み取れませんでした。ポケモン1匹ずつの詳細画面のスクリーンショットか確認するか、フォームに手入力してください。"
            : "画像からポケモンの情報を読み取れませんでした。チーム画面の「能力」「ステータス」のスクリーンショットか確認するか、フォームに手入力してください。",
        );
        setPhase("idle");
        return;
      }

      // 種族が分かるポケモンは、読み取った実数値を種族値・能力ポイント・性格から照合する。
      // 性格の読み違いが実数値から確定できれば直し、合わない項目は notes に出る。
      const checked = toCheckedTeamForms(result.data);
      setTeam(checked.forms);
      setActive(0);
      setHighlightEmpty(true);
      setNotice(
        `${result.data.length}匹を読み取りました。` +
          describeMissing(
            summarizeTeam(result.data).map((m) =>
              // 1匹ずつの画面は持ち物が出ないので、「未取得」とは数えない
              mode === "single" ? { ...m, missing: m.missing.filter((x) => x !== "持ち物") } : m,
            ),
          ) +
          (checked.corrections.length > 0
            ? ` 名前の読み違いを自動で直しました: ${checked.corrections.join("、")}。`
            : "") +
          (mode === "single"
            ? " 持ち物は画面に出ないため、メガシンカ後の姿が表示されていたポケモン以外は空欄です（候補から選べます）。"
            : "") +
          " AIの読み取りは間違うことがあるため、各ポケモンのタブで内容を必ず確認してください。",
      );
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析中に予期しないエラーが発生しました。");
      setPhase("idle");
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
    }
  };

  /* ------------------------------ チームの編集 ------------------------------ */

  const markEdited = () => {
    if (copyState !== "idle") setCopyState("idle");
  };

  const handleFormChange = (next: PokemonForm) => {
    setTeam((prev) => prev.map((p, i) => (i === safeActive ? next : p)));
    markEdited();
  };

  const handleAddMember = () => {
    if (team.length >= MAX_TEAM_SIZE) return;
    setTeam((prev) => [...prev, createEmptyForm()]);
    setActive(team.length);
    markEdited();
  };

  const handleRemoveMember = (index: number) => {
    if (team.length <= 1) return;
    const target = team[index];
    if (
      target &&
      hasContent(target) &&
      !window.confirm(`ポケモン${index + 1}を削除します。よろしいですか？`)
    ) {
      return;
    }
    setTeam((prev) => prev.filter((_, i) => i !== index));
    setActive((a) => Math.max(0, a > index ? a - 1 : Math.min(a, team.length - 2)));
    markEdited();
  };

  /* ------------------------------ その他の操作 ------------------------------ */

  const handleCopy = async () => {
    if (!outputText) return;
    const ok = await copyToClipboard(outputText);
    setCopyState(ok ? "copied" : "failed");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  };

  const handleReset = () => {
    if (
      team.some(hasContent) &&
      !window.confirm("入力内容をすべて消去します。よろしいですか？")
    ) {
      return;
    }
    abortRef.current?.abort();
    imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    setShots({ team: [], single: [] });
    setTeam([createEmptyForm()]);
    setActive(0);
    setError(null);
    setNotice(null);
    setHighlightEmpty(false);
    setPhase("idle");
    setCopyState("idle");
  };

  const canAnalyze = images.length > 0 && !busy;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6 border-b border-line pb-4">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">PokeScreen to Pokesol Converter</h1>
        <p className="mt-1 text-sm text-ink-sub">
          Pokémon Championsのスクリーンショットを読み取り、ポケソルに貼り付けられるチームテキストを作ります。
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[auto_1fr_auto]">
        {/* 手順1: 読み込み */}
        <section className="panel lg:col-start-1 lg:row-start-1" aria-labelledby="step1">
          <h2 id="step1" className="panel-title">
            1. スクリーンショットを読み込む
          </h2>

          {/* 読み取る画面の種類 */}
          <div role="tablist" aria-label="読み取る画面の種類" className="mb-4 grid grid-cols-2 gap-2">
            {(["team", "single"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={busy}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  mode === m
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line bg-white text-ink-sub hover:border-ink-faint hover:text-ink"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <Dropzone
            images={images}
            maxFiles={MAX_FILES[mode]}
            title={
              mode === "single"
                ? "ポケモン1匹ずつの詳細画面を、最大6枚までドロップ"
                : "チーム画面の「能力」「ステータス」を2枚まとめてドロップ"
            }
            hint={
              mode === "single"
                ? "またはクリックして選択（PNG / JPG・各20MBまで・1匹につき1枚）"
                : "またはクリックして選択（PNG / JPG・各20MBまで・片方だけでもOK）"
            }
            disabled={busy}
            onFiles={addFiles}
            onRemove={removeImage}
          />

          {mode === "single" && (
            <p className="mt-3 text-xs leading-relaxed text-ink-sub">
              持ち物は画面に出ないため、メガシンカ後の姿が表示されているポケモンだけ、メガストーンを自動で入れます。
              それ以外は、解析後に候補から選んでください。
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleAnalyze} disabled={!canAnalyze} className="btn-primary">
              {busy ? "解析中…" : images.length > 0 ? `${images.length}枚をAIで解析する` : "AIで解析する"}
            </button>
            {!busy && images.length === 0 && (
              <span className="text-xs text-ink-sub">先にスクリーンショットを追加してください。</span>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-sub">
            画像は解析のためサーバー経由でGoogle Gemini APIに送信されます。当サイトに保存はしません。
          </p>

          {/* 進捗（AI APIは進捗率を返さないため、率を持たないバーで表示） */}
          {busy && (
            <div className="mt-4" role="status" aria-live="polite">
              <p className="mb-2 text-sm text-ink">{PHASE_LABEL[phase]}</p>
              <div className="h-1 overflow-hidden rounded-sm bg-line">
                <div className="h-full w-[30%] animate-indeterminate bg-accent" />
              </div>
            </div>
          )}

          {error && (
            <Notice tone="error" className="mt-4" onClose={() => setError(null)}>
              {error}
            </Notice>
          )}
          {notice && !error && (
            <Notice tone="info" className="mt-4" onClose={() => setNotice(null)}>
              {notice}
            </Notice>
          )}
        </section>

        {/* 手順2: 確認・修正 */}
        <section className="panel lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="step2">
          <div className="panel-title flex items-center justify-between gap-3">
            <h2 id="step2" className="text-base font-bold">
              2. ポケモンごとに確認・修正する
            </h2>
            <button type="button" onClick={handleReset} disabled={busy} className="btn-small shrink-0 whitespace-nowrap">
              すべて消去
            </button>
          </div>

          <TeamTabs
            names={team.map((p) => p.name.trim())}
            active={safeActive}
            flaggedSlots={flaggedSlots}
            disabled={busy}
            onSelect={setActive}
            onAdd={handleAddMember}
            onRemove={handleRemoveMember}
          />

          <div id="pokemon-panel" role="tabpanel" aria-labelledby={`pokemon-tab-${safeActive}`}>
            <PokemonFormFields
              form={current}
              onChange={handleFormChange}
              highlightEmpty={highlightEmpty}
            />
          </div>
        </section>

        {/* 手順3: コピー */}
        <section className="panel lg:col-start-1 lg:row-start-2" aria-labelledby="step3">
          <h2 id="step3" className="panel-title">
            {exportCount > 1 ? `3. ポケソル用テキストをコピーする（${exportCount}匹分）` : "3. ポケソル用テキストをコピーする"}
          </h2>
          <OutputPanel
            text={outputText}
            warnings={warnings}
            onCopy={handleCopy}
            copyState={copyState}
            copyLabel={exportCount > 1 ? `${exportCount}匹分をまとめてコピー` : "クリップボードにコピー"}
          />
        </section>

        {/* フォームの下に配置（ボタン類から離し、誤クリックを誘発しない位置） */}
        <div className="lg:col-start-2 lg:row-start-3">
          <AdSlot
            name="サイドバー"
            slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR}
            minHeight={250}
          />
        </div>
      </div>

      <AdSlot
        name="フッター"
        slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_FOOTER}
        minHeight={100}
        className="mt-8"
      />

      <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-ink-sub">
        <p>
          画像の解析には Google の Gemini API（無料枠）を利用しています。アップロードした画像は解析のためだけに送信され、
          当サイトのサーバーには保存されません。なお、Gemini API の無料枠に送信された内容は Google の製品改善に利用されることがあります。
        </p>
        <p className="mt-1">
          非公式のファンツールです。ポケモンおよび関連名称は各権利者の商標または登録商標です。
        </p>
      </footer>
    </main>
  );
}
