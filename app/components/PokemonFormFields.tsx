"use client";

import { NATURES } from "@/lib/dictionary";
import { useMemo } from "react";
import { allocatePoints, learnableMoves, resolveSpecies, syncStats } from "@/lib/calc";
import { MOVE_TYPES } from "@/lib/data/moves";
import { DEX, SPECIES_NAMES } from "@/lib/pokedex";
import { ITEMS, MEGA_STONES, canonicalItem, stonesFor } from "@/lib/itemNames";
import { foldKana } from "@/lib/snap";
import { canonicalMove } from "@/lib/moveNames";
import Combobox, { type ComboOption } from "./Combobox";
import Notice from "./Notice";
import TypeBadge from "./TypeBadge";
import { genderMatters, hasGenderMark } from "@/lib/species";
import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from "@/lib/pokesol";
import {
  STAT_KEYS,
  STAT_LABEL_JA,
  STAT_SHORT,
  emptyStatRecord,
  type Gender,
  type MoveSlots,
  type PokemonForm,
  type StatKey,
} from "@/lib/types";

/**
 * ポケモンごとの確認・修正欄。ポケソルの編集画面と同じ並びにしている:
 *   ポケモン名 → 技 → 特性 → 持ち物 → 能力補正（性格）→ 能力ポイント（スライダー）
 * 種族が分かる場合、実数値は「種族値・能力ポイント・性格」から自動で計算して表示する。
 */

interface PokemonFormFieldsProps {
  form: PokemonForm;
  onChange: (next: PokemonForm) => void;
  /** 解析直後に、未取得（空欄）の項目を黄色の枠で目立たせる。省略時は強調なし */
  highlightEmpty?: boolean;
}

const WARN_CLASS = "!border-warn !ring-1 !ring-warn";

const MOVE_NAMES = Object.keys(MOVE_TYPES);
const JA_SORT = (a: string, b: string) => foldKana(a).localeCompare(foldKana(b), "ja");
const ALL_MOVES_SORTED = [...MOVE_NAMES].sort(JA_SORT);
const STONE_SET = new Set<string>(MEGA_STONES);
const PLAIN_ITEMS = ITEMS.filter((i) => !STONE_SET.has(i));
const typesOf = (name: string): readonly string[] | undefined => (DEX[name] ?? DEX[`${name}♂`])?.[0];

const toPoints = (v: string): number => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const digitsOnly = (v: string, max = 3) => v.replace(/\D/g, "").slice(0, max);

const stepButton =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-white text-base text-ink transition-colors hover:border-ink-faint disabled:cursor-not-allowed disabled:opacity-30";
const pillButton =
  "rounded border border-line bg-white px-2 py-1 text-xs font-medium text-ink-sub transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

export default function PokemonFormFields({
  form,
  onChange,
  highlightEmpty = false,
}: PokemonFormFieldsProps) {
  /** 強調モードのとき、空欄の入力だけ黄色の枠にする */
  const warn = (value: string) =>
    highlightEmpty && !value.trim() ? WARN_CLASS : "";

  const sp = resolveSpecies(form);
  const hasBase = Boolean(sp.dex);
  // イダイトウ・イエッサンなどは、性別で種族値が違うため、性別を選ぶまで種族データを引けない
  const needsGender =
    !sp.dex &&
    Boolean(form.name.trim()) &&
    genderMatters(form.name) &&
    !form.gender &&
    !hasGenderMark(form.name.trim());

  /** 変更を反映する。種族が分かる場合は、実数値を計算し直す */
  const update = (patch: Partial<PokemonForm>) => onChange(syncStats({ ...form, ...patch }));

  const setMove = (index: number, value: string) => {
    const moves = [...form.moves] as MoveSlots;
    moves[index] = value;
    update({ moves });
  };

  /* ---- 候補 ---- */
  const speciesOptions = useMemo<ComboOption[]>(() => {
    const wantMega = form.name.startsWith("メガ");
    return SPECIES_NAMES.filter((n) => wantMega || !n.startsWith("メガ")).map((n) => ({
      value: n,
      badges: typesOf(n),
    }));
  }, [form.name.startsWith("メガ")]); // eslint-disable-line react-hooks/exhaustive-deps

  const learn = learnableMoves(form);
  const learnSorted = useMemo(() => (learn ? [...learn].sort(JA_SORT) : undefined), [learn]);
  const moveOptionsFor = (index: number): ComboOption[] => {
    const taken = new Set(form.moves.filter((_, i) => i !== index).map((m) => m.trim()));
    return (learnSorted ?? ALL_MOVES_SORTED)
      .filter((m) => !taken.has(m))
      .map((m) => ({ value: m, badges: MOVE_TYPES[m] ? [MOVE_TYPES[m]] : undefined }));
  };

  const ownStones = stonesFor(sp.baseName || form.name.trim());
  const itemOptions = useMemo<ComboOption[]>(() => {
    const list: ComboOption[] = ownStones.map((v) => ({ value: v, group: "このポケモンのメガストーン" }));
    const others = form.name.trim() && ownStones.length === 0 && sp.dex ? [] : MEGA_STONES.filter((x) => !ownStones.includes(x));
    return [
      ...list,
      ...PLAIN_ITEMS.map((v) => ({ value: v, group: ownStones.length ? "持ち物" : undefined })),
      ...(sp.dex ? [] : others.map((v) => ({ value: v, group: "メガストーン" }))),
    ];
  }, [ownStones.join(","), Boolean(sp.dex)]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- 能力ポイント ---- */
  const points = STAT_KEYS.map((k) => toPoints(form.evs[k]));
  const total = points.reduce((a, b) => a + b, 0);
  const remaining = MAX_EV_TOTAL - total;
  const nature = NATURES.find((n) => n.ja === form.nature);

  const setPoints = (key: StatKey, value: number) =>
    update({ evs: allocatePoints(form.evs, key, value) });

  const setManualStat = (key: StatKey, value: string) =>
    onChange({ ...form, stats: { ...form.stats, [key]: digitsOnly(value) } });

  const abilityCandidates = (sp.isMega ? sp.baseDex : sp.dex)?.[1] ?? [];

  return (
    <div className="space-y-6 [&>section+section]:border-t [&>section+section]:border-line [&>section+section]:pt-6">
      {/* ポケモン */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <label className="sm:col-span-4">
          <span className="field-label">ポケモン</span>
          <Combobox
            value={form.name}
            onChange={(name) => update({ name })}
            options={speciesOptions}
            placeholder="名前を入力（例: ガブリアス）"
            ariaLabel="ポケモン"
            className={warn(form.name)}
            trailing={sp.dex ? sp.dex[0].map((t) => <TypeBadge key={t} type={t} />) : undefined}
            emptyText="チャンピオンズで使えるポケモンに該当がありません"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">性別</span>
          <select
            className="field-input"
            value={form.gender}
            onChange={(e) => update({ gender: e.target.value as Gender })}
          >
            <option value="">なし／不明</option>
            <option value="M">♂ オス</option>
            <option value="F">♀ メス</option>
          </select>
        </label>
        <p className="-mt-2 text-xs text-ink-sub sm:col-span-6">
          姿違いは「ゾロアーク(ヒスイ)」「パンプジン(大)」の形で入力します。性別は、イダイトウなど性別で姿や技が変わるポケモンのときだけ、
          「イダイトウ(♂)」（メガシンカは「メガニャオニクス♂」）の形で出力されます。
          {sp.isMega && form.item.trim() && !form.name.startsWith("メガ") && (
            <> メガストーンを持たせているので、出力は「{sp.name}」になります。</>
          )}
        </p>
        {needsGender && (
          <Notice tone="warn" className="-mt-2 sm:col-span-6">
            「{form.name.trim()}」は性別で種族値が変わります。上の「性別」を選ぶと、種族データを読み込んで実数値を計算します。
          </Notice>
        )}
        {form.name.trim() && !sp.dex && !needsGender && (
          <Notice tone="warn" className="-mt-2 sm:col-span-6">
            「{form.name.trim()}」の種族データが見つかりません。名前の表記を確認してください（候補から選べます）。
            このままでも、実数値は下の欄に手入力すれば出力できます。
          </Notice>
        )}
      </section>

      {/* 技（そのポケモンが覚える技だけを候補に出す。技名の右にタイプのバッジ） */}
      <section>
        <h3 className="field-label">技（最大4つ）</h3>
        <div className="space-y-2">
          {form.moves.map((move, i) => {
            const name = canonicalMove(move.trim()).name;
            const type = MOVE_TYPES[name];
            const unlearnable = Boolean(name && learn && !learn.includes(name));
            return (
              <div key={i}>
                <Combobox
                  value={move}
                  onChange={(v) => setMove(i, v)}
                  options={moveOptionsFor(i)}
                  placeholder={`技${i + 1}`}
                  ariaLabel={`技${i + 1}`}
                  className={i === 0 ? warn(move) : ""}
                  trailing={type ? <TypeBadge type={type} /> : undefined}
                  clearable
                  emptyText="覚える技に該当がありません"
                />
                {name && !type ? (
                  <p className="mt-1 text-xs text-ink-sub">
                    「{name}」は候補にない技名です。表記が合っているか確認してください。
                  </p>
                ) : (
                  unlearnable && (
                    <p className="mt-1 text-xs text-warn">
                      「{name}」は、このポケモンが覚える技の一覧にありません（表記違いか、データの未収録かもしれません）。
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-sub">
          {learn
            ? `${sp.baseName || form.name.trim()}が覚える技（${learn.length}種）から選べます。`
            : form.name.trim()
              ? "このポケモンの覚える技のデータが無いため、全ての技から選べます（性別で分かれるポケモンは、性別を選ぶと絞り込まれます）。"
              : "ポケモンを選ぶと、そのポケモンが覚える技だけが候補に出ます。"}
        </p>
      </section>

      {/* 特性・持ち物・能力補正 */}
      <section className="space-y-4">
        {sp.isMega && (
          <div>
            <span className="field-label">{sp.name}の特性</span>
            <div className="field-input !cursor-default bg-paper text-ink-sub">
              {sp.megaAbility}
              <span className="ml-2 text-xs text-ink-sub">（メガシンカ後の特性・自動）</span>
            </div>
          </div>
        )}
        <div className="block">
          <span className="field-label">
            {sp.isMega ? `${sp.baseName}の特性` : "特性"}
          </span>
          <Combobox
            value={form.ability}
            onChange={(ability) => update({ ability })}
            options={abilityCandidates.map((value) => ({ value }))}
            placeholder={abilityCandidates.length ? "特性を選択" : "先にポケモンを選んでください"}
            ariaLabel="特性"
            className={warn(form.ability)}
            emptyText="先にポケモンを選ぶと、特性の候補が出ます"
          />
          {form.ability.trim() && abilityCandidates.length > 0 && !abilityCandidates.includes(form.ability.trim()) && (
            <span className="mt-1 block text-xs text-warn">
              「{form.ability.trim()}」は、このポケモンの特性にありません。候補から選んでください。
            </span>
          )}
          {sp.isMega && (
            <span className="mt-1 block text-xs text-ink-sub">
              出力は「{sp.megaAbility}({form.ability.trim() || "元の特性"})」の形になります。
            </span>
          )}
        </div>

        <div className="block">
          <span className="field-label">持ち物</span>
          <Combobox
            value={form.item}
            onChange={(item) => update({ item })}
            options={itemOptions}
            placeholder="持ち物を選択（例: こだわりスカーフ）"
            ariaLabel="持ち物"
            className={warn(form.item)}
            clearable
            emptyText="候補にない持ち物です（そのまま入力もできます）"
          />
          {form.item.trim() && canonicalItem(form.item.trim(), form.name).kind === "none" && (
            <span className="mt-1 block text-xs text-ink-sub">
              「{form.item.trim()}」は候補にない持ち物です。表記が合っているか確認してください。
            </span>
          )}
        </div>

        <label className="block">
          <span className="field-label">能力補正（性格）</span>
          <select
            className={`field-input ${warn(form.nature)}`}
            value={form.nature}
            onChange={(e) => update({ nature: e.target.value })}
          >
            <option value="">未選択</option>
            {NATURES.map((n) => (
              <option key={n.ja} value={n.ja}>
                {n.plus && n.minus
                  ? `${n.ja}（${STAT_SHORT[n.plus]}↑ ${STAT_SHORT[n.minus]}↓）`
                  : `${n.ja}（補正なし）`}
              </option>
            ))}
          </select>
          {hasBase && !form.nature && (
            <span className="mt-1 block text-xs text-warn">
              性格を選ぶと、実数値を計算して表示します。
            </span>
          )}
        </label>
      </section>

      {/* 能力ポイント */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="field-label !mb-0">能力ポイント</h3>
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-2 py-1 text-xs font-bold tabular-nums ${
                remaining < 0
                  ? "border-danger-line bg-danger-soft text-danger"
                  : "border-line bg-paper text-ink"
              }`}
              aria-live="polite"
            >
              {remaining < 0 ? `超過 ${-remaining}` : `残 ${remaining}`} / {MAX_EV_TOTAL}
            </span>
            <button
              type="button"
              className={pillButton}
              onClick={() => update({ evs: emptyStatRecord() })}
              disabled={total === 0}
            >
              全リセット
            </button>
          </div>
        </div>

        <div className="divide-y divide-line overflow-hidden rounded border border-line">
          {STAT_KEYS.map((key, i) => {
            const pts = points[i];
            const up = nature?.plus === key;
            const down = nature?.minus === key;
            const tone = up ? "text-danger" : down ? "text-accent" : "text-ink";
            const room = Math.max(
              0,
              Math.min(MAX_EV_PER_STAT, MAX_EV_TOTAL - (total - pts)),
            );
            return (
              <div key={key} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`w-12 shrink-0 text-sm font-bold ${tone}`}
                    title={STAT_LABEL_JA[key]}
                  >
                    {STAT_SHORT[key]}
                    {up ? " ↑" : down ? " ↓" : ""}
                  </span>
                  <button
                    type="button"
                    className={stepButton}
                    onClick={() => setPoints(key, pts - 1)}
                    disabled={pts <= 0}
                    aria-label={`${STAT_LABEL_JA[key]}の能力ポイントを1減らす`}
                  >
                    −
                  </button>
                  <input
                    className="field-input !w-14 !px-2 text-center tabular-nums"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_EV_PER_STAT}
                    value={pts}
                    onChange={(e) => setPoints(key, Number(e.target.value))}
                    aria-label={`${STAT_LABEL_JA[key]}の能力ポイント`}
                  />
                  <button
                    type="button"
                    className={stepButton}
                    onClick={() => setPoints(key, pts + 1)}
                    disabled={pts >= room}
                    aria-label={`${STAT_LABEL_JA[key]}の能力ポイントを1増やす`}
                  >
                    ＋
                  </button>

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      className={pillButton}
                      onClick={() => setPoints(key, 0)}
                      disabled={pts <= 0}
                    >
                      MIN
                    </button>
                    {hasBase ? (
                      <span
                        className={`w-11 text-right text-base font-bold tabular-nums ${tone}`}
                        aria-label={`${STAT_LABEL_JA[key]}の実数値`}
                      >
                        {form.stats[key] || "—"}
                      </span>
                    ) : (
                      <input
                        className="field-input !w-14 !px-2 text-center tabular-nums"
                        inputMode="numeric"
                        value={form.stats[key]}
                        onChange={(e) => setManualStat(key, e.target.value)}
                        aria-label={`${STAT_LABEL_JA[key]}の実数値（手入力）`}
                        placeholder="—"
                      />
                    )}
                    <button
                      type="button"
                      className={pillButton}
                      onClick={() => setPoints(key, MAX_EV_PER_STAT)}
                      disabled={pts >= room}
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <input
                  className="mt-2 h-2 w-full cursor-pointer accent-accent"
                  type="range"
                  min={0}
                  max={MAX_EV_PER_STAT}
                  step={1}
                  value={pts}
                  onChange={(e) => setPoints(key, Number(e.target.value))}
                  aria-label={`${STAT_LABEL_JA[key]}の能力ポイント（スライダー）`}
                />
              </div>
            );
          })}
        </div>

      </section>
    </div>
  );
}
