import { NATURES, TYPES } from "./dictionary";
import { normalizeSpeciesName } from "./species";
import {
  MAX_TEAM_SIZE,
  STAT_KEYS,
  createEmptyForm,
  type ExtractedPokemon,
  type MoveSlots,
  type PokemonForm,
  type StatKey,
  type StatRecord,
} from "./types";

/* ------------------------------------------------------------------ */
/* AIの応答（信用できない入力）を検証・整形する                         */
/* ------------------------------------------------------------------ */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 文字列を整形。空・長すぎるものは捨てる（プロンプトインジェクション対策も兼ねる） */
function cleanString(v: unknown, maxLen = 24): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length === 0 || s.length > maxLen) return undefined;
  const lowered = s.toLowerCase();
  if (["null", "none", "n/a", "unknown", "不明", "なし", "-", "—"].includes(lowered)) {
    return undefined;
  }
  return s;
}

function cleanInt(v: unknown, min: number, max: number): number | undefined {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && /^\s*\d{1,4}\s*$/.test(v)
        ? Number(v)
        : NaN;
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  return i >= min && i <= max ? i : undefined;
}

function cleanStatMap(v: unknown, min: number, max: number): Partial<StatRecord> {
  const out: Partial<StatRecord> = {};
  if (!isRecord(v)) return out;
  for (const key of STAT_KEYS) {
    const n = cleanInt(v[key], min, max);
    if (n !== undefined) out[key] = String(n);
  }
  return out;
}

/** 辞書にある表記に寄せる（AIが「ほのお」ではなく「炎」などと返した場合の保険） */
function canonicalType(v: unknown): string | undefined {
  const s = cleanString(v, 12);
  if (!s) return undefined;
  const hit = TYPES.find(
    (t) => t.ja === s || t.en.toLowerCase() === s.toLowerCase() || `${t.ja}タイプ` === s,
  );
  return hit?.ja;
}

/** 補正なしの性格（5種あり、計算結果はどれも同じ。代表として使う） */
const NEUTRAL_NATURE = "がんばりや";

/** AIが漢字や別表記で返した場合の保険 */
const NATURE_ALIASES: Record<string, string> = {
  生意気: "なまいき",
  臆病: "おくびょう",
  陽気: "ようき",
  無邪気: "むじゃき",
  慎重: "しんちょう",
  控えめ: "ひかえめ",
  穏やか: "おだやか",
  冷静: "れいせい",
  大人しい: "おとなしい",
  勇敢: "ゆうかん",
  意地っ張り: "いじっぱり",
  腕白: "わんぱく",
  呑気: "のんき",
  図太い: "ずぶとい",
  せっかち: "せっかち",
  補正なし: NEUTRAL_NATURE,
  無補正: NEUTRAL_NATURE,
};

const isNeutralNature = (ja: string): boolean =>
  NATURES.some((n) => n.ja === ja && !n.plus && !n.minus);

function canonicalNature(v: unknown): string | undefined {
  let s = cleanString(v, 12);
  if (!s) return undefined;
  s = s.replace(/(の)?(性格|せいかく)$/, "");
  s = NATURE_ALIASES[s] ?? s;
  const hit = NATURES.find(
    (n) => s === n.ja || s.toLowerCase() === n.en.toLowerCase() || s === `${n.ja}な`,
  );
  return hit?.ja;
}

function cleanGender(v: unknown): "M" | "F" | undefined {
  const s = cleanString(v, 8)?.toLowerCase();
  if (!s) return undefined;
  if (["m", "male", "♂", "オス", "雄"].includes(s)) return "M";
  if (["f", "female", "♀", "メス", "雌"].includes(s)) return "F";
  return undefined;
}

/** 性格の補正に関わる5つの能力（HPは補正されない） */
const NATURE_STATS: StatKey[] = ["atk", "def", "spa", "spd", "spe"];
const NATURE_STAT_ALIASES: Record<string, StatKey> = {
  atk: "atk",
  def: "def",
  spa: "spa",
  spd: "spd",
  spe: "spe",
  こうげき: "atk",
  ぼうぎょ: "def",
  とくこう: "spa",
  とくぼう: "spd",
  すばやさ: "spe",
  攻撃: "atk",
  防御: "def",
  特攻: "spa",
  特防: "spd",
  素早さ: "spe",
};

function cleanNatureStat(v: unknown): StatKey | undefined {
  const s = cleanString(v, 8);
  if (!s) return undefined;
  const key = NATURE_STAT_ALIASES[s] ?? NATURE_STAT_ALIASES[s.toLowerCase()];
  return key && NATURE_STATS.includes(key) ? key : undefined;
}

/** ↑の能力と↓の能力から性格を決める（対応表はコード側で持つ） */
export function natureFromArrows(
  up: StatKey | undefined,
  down: StatKey | undefined,
): string | undefined {
  if (!up || !down || up === down) return undefined;
  return NATURES.find((n) => n.plus === up && n.minus === down)?.ja;
}

/** 1つの能力に付いていた印。up=赤↑(1.1倍) / down=青↓(0.9倍) / none=印なし */
type Mark = "up" | "down" | "none";
type Marks = Partial<Record<StatKey, Mark>>;

/** 注意: cleanString は "none" や "なし" を捨てるため、印は専用に解釈する */
function cleanMark(v: unknown): Mark | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.normalize("NFKC").trim().toLowerCase();
  if (!s) return undefined;
  if (/^(none|なし|無し|無|neutral|normal|-|—|–)$/.test(s)) return "none";
  if (/up|↑|⬆|上|赤|red|^\+$/.test(s)) return "up";
  if (/down|↓|⬇|下|青|blue/.test(s)) return "down";
  return undefined;
}

/**
 * AIの応答から5能力の印を集める。新形式 statMarks を優先し、
 * 旧形式の natureUp / natureDown（どの能力が↑／↓か）も受け付ける。
 */
function readMarks(raw: Record<string, unknown>): Marks {
  const marks: Marks = {};
  if (isRecord(raw.statMarks)) {
    for (const key of NATURE_STATS) {
      const m = cleanMark(raw.statMarks[key]);
      if (m) marks[key] = m;
    }
  }
  const up = cleanNatureStat(raw.natureUp);
  const down = cleanNatureStat(raw.natureDown);
  if (up && !marks[up]) marks[up] = "up";
  if (down && !marks[down]) marks[down] = "down";
  return marks;
}

/**
 * 性格の決定ルール（上から順に採用）:
 *  1. ↑がちょうど1つ・↓がちょうど1つ読めた → 対応表で決定（AIの性格名より優先）
 *  2. 5能力すべてが「印なし」と読めた → 補正なし（がんばりや）
 *  3. AIが性格名を返していて、読めた印と矛盾しない → その性格名
 *  4. 上記のどれでもない → 未取得（空欄）。読めていないのに「補正なし」とは決めない。
 */
export function decideNature(raw: Record<string, unknown>): string | undefined {
  const marks = readMarks(raw);
  const ups = NATURE_STATS.filter((k) => marks[k] === "up");
  const downs = NATURE_STATS.filter((k) => marks[k] === "down");
  const seen = NATURE_STATS.filter((k) => marks[k] !== undefined).length;

  if (ups.length === 1 && downs.length === 1) {
    return natureFromArrows(ups[0], downs[0]);
  }
  const named = canonicalNature(raw.nature);
  if (ups.length === 0 && downs.length === 0 && seen === NATURE_STATS.length) {
    return named && isNeutralNature(named) ? named : NEUTRAL_NATURE;
  }
  if (named) {
    const info = NATURES.find((n) => n.ja === named);
    if (!info) return undefined;
    if (ups.length > 0 && !(info.plus && ups.includes(info.plus))) return undefined;
    if (downs.length > 0 && !(info.minus && downs.includes(info.minus))) return undefined;
    return named;
  }
  return undefined;
}

/** 「メガガブリアスZ」のようなメガシンカ後の名前だけを通す（全角のX/Y/Zは半角にそろえる） */
function cleanMegaForm(v: unknown): string | undefined {
  const s = cleanString(v, 24)?.normalize("NFKC").replace(/\s+/g, "");
  return s && /^メガ.+/.test(s) ? s : undefined;
}

/** 種族のタイプ（最大2つ）。表にないタイプ名は捨てる */
function cleanTypes(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const t of v) {
    const c = canonicalType(t);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= 2) break;
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeEntry(raw: unknown): ExtractedPokemon | null {
  if (!isRecord(raw)) return null;

  const movesRaw = Array.isArray(raw.moves) ? raw.moves : [];
  const moves: string[] = [];
  for (const m of movesRaw) {
    const s = cleanString(m, 20);
    if (s && !moves.includes(s)) moves.push(s);
    if (moves.length >= 4) break;
  }

  const stats = cleanStatMap(raw.stats, 1, 999);
  const evs = cleanStatMap(raw.evs, 0, 252);
  const level = cleanInt(raw.level, 1, 100);

  // 名前: 姿違いは「ゾロアーク(ヒスイ)」の形にそろえる（性別記号が混ざっていれば取り出す）
  const rawName = cleanString(raw.name, 24);
  const speciesName = rawName ? normalizeSpeciesName(rawName) : undefined;

  // 性格: 5能力の印（↑↓）から決定。決め方は decideNature を参照
  const nature = decideNature(raw);

  const entry: ExtractedPokemon = {
    slot: cleanInt(raw.slot, 1, MAX_TEAM_SIZE),
    name: speciesName?.name,
    gender: cleanGender(raw.gender) ?? speciesName?.gender,
    item: cleanString(raw.item, 24),
    megaForm: cleanMegaForm(raw.megaForm),
    ability: cleanString(raw.ability, 20),
    types: cleanTypes(raw.types),
    teraType: canonicalType(raw.teraType),
    nature,
    level: level !== undefined ? String(level) : undefined,
    moves,
    stats,
    evs,
  };

  const hasContent =
    Boolean(entry.name || entry.item || entry.ability) ||
    moves.length > 0 ||
    Object.keys(stats).length > 0 ||
    Object.keys(evs).length > 0;
  return hasContent ? entry : null;
}

export interface SanitizedAiResult {
  data: ExtractedPokemon[];
  notes: string[];
}

/**
 * AIが返したJSONを、アプリが扱える安全な形に変換する。想定外の形でも例外は投げない。
 * 期待する形は { pokemon: [...], notes: [...] }。素の配列や、1匹分のオブジェクトも受け付ける。
 */
export function sanitizeAiResult(raw: unknown): SanitizedAiResult {
  let list: unknown[] = [];
  let notesRaw: unknown = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (isRecord(raw)) {
    notesRaw = raw.notes;
    if (Array.isArray(raw.pokemon)) list = raw.pokemon;
    else if ("name" in raw || "moves" in raw) list = [raw];
  }

  let data = list
    .slice(0, MAX_TEAM_SIZE * 2) // 暴走した出力への保険（後で6匹に切り詰める）
    .map(sanitizeEntry)
    .filter((e): e is ExtractedPokemon => e !== null);

  // タイル番号がすべて読めていれば、その順に並べる
  if (data.length > 1 && data.every((e) => e.slot !== undefined)) {
    data = [...data].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  }
  data = data.slice(0, MAX_TEAM_SIZE);

  const notes = (Array.isArray(notesRaw) ? notesRaw : [])
    .map((n) => cleanString(n, 120))
    .filter((n): n is string => Boolean(n))
    .slice(0, 6);

  return { data, notes };
}

/** モデルの出力テキストから JSON を取り出す（コードフェンスや前置き付きでも可） */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fallthrough */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fallthrough */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fallthrough */
    }
  }
  throw new Error("JSONとして解釈できませんでした");
}

/* ------------------------------------------------------------------ */
/* クライアント側: 抽出結果 → フォーム、要約                             */
/* ------------------------------------------------------------------ */

/** 抽出結果を1匹分のフォームへ反映する。見つかった項目のみ上書きし、それ以外は現状維持。 */
export function applyExtraction(prev: PokemonForm, p: ExtractedPokemon): PokemonForm {
  const moves = [...prev.moves] as MoveSlots;
  if (p.moves.length > 0) {
    for (let i = 0; i < 4; i++) moves[i] = p.moves[i] ?? "";
  }
  return {
    ...prev,
    name: p.name || prev.name,
    gender: p.gender ?? prev.gender,
    item: p.item || prev.item,
    ability: p.ability || prev.ability,
    teraType: p.teraType || prev.teraType,
    nature: p.nature || prev.nature,
    level: p.level || prev.level,
    moves,
    stats: { ...prev.stats, ...p.stats },
    evs: { ...prev.evs, ...p.evs },
  };
}

/** 抽出された全員分を、編集用のフォーム配列にする（最大6匹） */
export function toTeamForms(list: ExtractedPokemon[]): PokemonForm[] {
  return list.slice(0, MAX_TEAM_SIZE).map((p) => applyExtraction(createEmptyForm(), p));
}

export interface MemberSummary {
  /** 1始まりの番号 */
  index: number;
  name: string;
  /** 取得できなかった項目 */
  missing: string[];
}

/**
 * 取得できなかった項目をポケモンごとに集計する（ユーザーへの案内用）。
 * テラスタイプは、画面に表示されないゲームもあるため「未取得」には数えない。
 */
export function summarizeTeam(list: ExtractedPokemon[]): MemberSummary[] {
  const has = (r: Partial<Record<StatKey, string>>) => Object.keys(r).length > 0;
  return list.map((p, i) => {
    const checks: Array<[string, boolean]> = [
      ["ポケモン名", Boolean(p.name)],
      ["特性", Boolean(p.ability)],
      ["性格", Boolean(p.nature)],
      ["持ち物", Boolean(p.item)],
      ["技", p.moves.length > 0],
      ["実数値", has(p.stats)],
      ["努力値", has(p.evs)],
    ];
    return {
      index: i + 1,
      name: p.name ?? "",
      missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
    };
  });
}
