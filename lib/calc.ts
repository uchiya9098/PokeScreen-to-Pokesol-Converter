import { NATURES } from "./dictionary";
import { applyExtraction } from "./extract";
import { CONVERT_MEGA, MEGA_ABILITIES, megaFor } from "./mega";
import { MOVE_TYPES } from "./data/moves";
import { canonicalItem, stoneForMega } from "./itemNames";
import { learnsetFor } from "./learnset";
import { canonicalMove, MOVE_NAMES } from "./moveNames";
import { DEX, SPECIES_NAMES, type BaseStats, type DexEntry } from "./pokedex";
import { closestMatch, maxDistanceForAbilities } from "./snap";
import { normalizeSpeciesName } from "./species";
import {
  MAX_EV_PER_STAT,
  MAX_EV_TOTAL,
  MAX_TEAM_SIZE,
  STAT_KEYS,
  STAT_LABEL_JA,
  createEmptyForm,
  type ExtractedPokemon,
  type Gender,
  type PokemonForm,
  type StatKey,
  type StatRecord,
} from "./types";

/* ------------------------------------------------------------------ */
/* 種族の特定                                                          */
/* ------------------------------------------------------------------ */

/** 名前（と性別）から種族データを引く。「イダイトウ」+ 性別 M → 「イダイトウ♂」のデータ。 */
export function lookupDex(rawName: string, gender: Gender = ""): DexEntry | undefined {
  const { name, gender: fromName } = normalizeSpeciesName(rawName);
  const g = gender || fromName || "";
  const mark = g === "M" ? "♂" : g === "F" ? "♀" : "";
  return (mark ? DEX[`${name}${mark}`] : undefined) ?? DEX[name];
}

/** 「メガリザードンX」→「リザードン」、「メガメガニウム」→「メガニウム」 */
export function baseFormName(megaName: string): string {
  const noMega = megaName.replace(/^メガ/, "");
  const noSuffix = noMega.replace(/[XYZ]$/, "");
  return DEX[noSuffix] || !DEX[noMega] ? noSuffix : noMega;
}

export interface SpeciesInfo {
  /** 出力に使う名前（メガストーン持ちはメガシンカ後の名前に変換済み）。名前が空なら "" */
  name: string;
  /** 種族データ（見つからなければ undefined） */
  dex?: DexEntry;
  /** メガシンカ後か */
  isMega: boolean;
  /** メガシンカ前（通常のすがた）の種族データ。メガでなければ dex と同じ */
  baseDex?: DexEntry;
  /** メガシンカ前の名前 */
  baseName: string;
  /** メガシンカ後の特性（メガでなければ undefined） */
  megaAbility?: string;
}

export function resolveSpecies(form: Pick<PokemonForm, "name" | "gender" | "item">): SpeciesInfo {
  const raw = form.name.trim();
  if (!raw) return { name: "", isMega: false, baseName: "" };
  const { name } = normalizeSpeciesName(raw);
  const mega = CONVERT_MEGA ? megaFor(name, form.item.trim()) : null;
  const effective = mega ? mega.name : name;
  const isMega = effective.startsWith("メガ") && effective in MEGA_ABILITIES;
  const baseName = isMega ? baseFormName(effective) : effective;
  const dex = lookupDex(effective, form.gender);
  return {
    name: effective,
    dex,
    isMega,
    baseName,
    baseDex: isMega ? lookupDex(baseName, form.gender) : dex,
    megaAbility: isMega ? MEGA_ABILITIES[effective] : undefined,
  };
}

/**
 * そのポケモンがチャンピオンズで覚える技の一覧。メガストーン持ちはメガシンカ前の種族で引く。
 * データが無い種族（性別未選択のイダイトウなど）は undefined。
 */
export function learnableMoves(form: Pick<PokemonForm, "name" | "gender" | "item">): readonly string[] | undefined {
  const sp = resolveSpecies(form);
  if (!sp.baseName) return undefined;
  const { name, gender: fromName } = normalizeSpeciesName(sp.baseName);
  const g = form.gender || fromName || "";
  const mark = g === "M" ? "♂" : g === "F" ? "♀" : "";
  return (mark ? learnsetFor(`${name}${mark}`) : undefined) ?? learnsetFor(name);
}

/* ------------------------------------------------------------------ */
/* 実数値の計算（Lv50・個体値31固定。能力ポイントは1ポイント=+1）        */
/*   HP        = floor((2×種族値+31)/2) + 60 + ポイント                  */
/*   HP以外    = floor((floor((2×種族値+31)/2) + 5 + ポイント) × 性格補正) */
/* ポケソルの画面の数値（メガフラエッテ H175 A94 B114 C176 D168 S169 ほか）と一致することを確認済み */
/* ------------------------------------------------------------------ */

/** 性格補正（10倍した整数。↑=11, ↓=9, なし=10）。小数の誤差を避けるため整数で計算する */
export function natureMult10(nature: string, key: StatKey): 9 | 10 | 11 {
  const n = NATURES.find((x) => x.ja === nature);
  if (n?.plus === key) return 11;
  if (n?.minus === key) return 9;
  return 10;
}

export function computeStat(key: StatKey, base: number, points: number, nature: string): number {
  const core = Math.floor((2 * base + 31) / 2);
  if (key === "hp") return core + 60 + points;
  return Math.floor(((core + 5 + points) * natureMult10(nature, key)) / 10);
}

const toPoints = (v: string): number => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * スライダー・＋－・MAX・数値入力で能力ポイントを変えたときの割り当て。
 * 1項目は 0〜32、合計は 66 まで。残りが足りないときは、入る分だけ入れる（例: 残り10なら MAX でも +10）。
 */
export function allocatePoints(evs: StatRecord, key: StatKey, value: number): StatRecord {
  const current = toPoints(evs[key]);
  const total = STAT_KEYS.reduce((sum, k) => sum + toPoints(evs[k]), 0);
  const room = Math.max(0, Math.min(MAX_EV_PER_STAT, MAX_EV_TOTAL - (total - current)));
  const v = Math.round(Number.isFinite(value) ? value : 0);
  const next = Math.min(Math.max(0, v), room);
  return { ...evs, [key]: next > 0 ? String(next) : "" };
}

export function computeStats(
  base: BaseStats,
  evs: StatRecord,
  nature: string,
): Record<StatKey, number> {
  const out = {} as Record<StatKey, number>;
  STAT_KEYS.forEach((k, i) => {
    out[k] = computeStat(k, base[i], toPoints(evs[k]), nature);
  });
  return out;
}

/**
 * 種族が分かる場合、実数値を「種族値・能力ポイント・性格」から計算して入れ直す。
 * 種族が分からない場合は何も変えない（実数値は手入力のまま）。
 */
export function syncStats(form: PokemonForm): PokemonForm {
  const dex = resolveSpecies(form).dex;
  if (!dex) return form;
  // 性格が未取得のまま計算すると「補正なし」として値が変わってしまうので、性格が決まるまで触らない
  if (!form.nature) return form;
  const c = computeStats(dex[2], form.evs, form.nature);
  const stats = {} as StatRecord;
  for (const k of STAT_KEYS) stats[k] = String(c[k]);
  return { ...form, stats };
}

/* ------------------------------------------------------------------ */
/* AIの読み取り結果の照合                                              */
/* ------------------------------------------------------------------ */

/** 補正の組み合わせとして区別できる性格（補正なしは「がんばりや」1つにまとめる） */
const DISTINCT_NATURES = NATURES.filter((n) => (n.plus && n.minus) || n.ja === "がんばりや");

/**
 * 画面から読み取った実数値6つと能力ポイントが、ちょうど1通りの性格と矛盾なく合うなら、その性格を返す。
 * 性格の矢印を読み違えていても、実数値から正しい性格を決められる（複数通り・0通りなら undefined）。
 */
export function inferNatureFromStats(
  base: BaseStats,
  stats: Partial<Record<StatKey, string>>,
  evs: StatRecord,
): string | undefined {
  if (!STAT_KEYS.every((k) => (stats[k] ?? "") !== "")) return undefined;
  const hits = DISTINCT_NATURES.filter((n) => {
    const c = computeStats(base, evs, n.ja);
    return STAT_KEYS.every((k) => String(c[k]) === stats[k]);
  });
  return hits.length === 1 ? hits[0].ja : undefined;
}

/* ------------------------------------------------------------------ */
/* ニックネーム対策: 特性・実数値から種族を特定する（APIは呼ばない）        */
/* ------------------------------------------------------------------ */

/** 実数値6つと能力ポイントが、どれかの性格で矛盾なく合うか */
function statsFit(base: BaseStats, stats: Partial<Record<StatKey, string>>, evs: StatRecord): boolean {
  return DISTINCT_NATURES.some((n) => {
    const c = computeStats(base, evs, n.ja);
    return STAT_KEYS.every((k) => String(c[k]) === stats[k]);
  });
}

/** 種族データの候補（メガシンカ後は除く。画面の特性・実数値はメガシンカ前の値なので） */
const BASE_DEX_KEYS = Object.keys(DEX).filter((k) => !k.startsWith("メガ"));
const stripGenderMark = (k: string): string => k.replace(/[♂♀]$/, "");

/**
 * 画面のタイルにニックネームが出ていると、AIが名前を取り違える（例: 「最後の勇者」→ソウブレイズ）。
 * 読み取った特性と実数値（と能力ポイント）に合う種族が1つに決まるなら、その種族名に直す。
 *  - 今の名前が種族として存在し、特性・実数値と矛盾しない → そのまま
 *  - 名前が種族として存在しない（ニックネームのまま）→ 特性・実数値に合う種族が1つなら、それに置き換える
 *  - 名前は種族だが、実数値6つが合わない → 実数値に合う種族が1つのときだけ置き換える（誤読の保護）
 */
export function identifySpecies(
  p: ExtractedPokemon,
  index: number,
): { entry: ExtractedPokemon; fixes: string[]; notes: string[] } {
  const none = { entry: p, fixes: [] as string[], notes: [] as string[] };
  const ability = p.ability && !p.ability.includes("(") ? p.ability : "";
  const statsComplete = STAT_KEYS.every((k) => (p.stats[k] ?? "") !== "");
  if (!ability && !statsComplete) return none;
  const evs = p.evs as StatRecord;

  const fits = (dex: DexEntry): boolean =>
    (!ability || dex[1].includes(ability)) && (!statsComplete || statsFit(dex[2], p.stats, evs));

  const types = p.types && p.types.length > 0 ? p.types : undefined;
  const typesOk = (dex: DexEntry): boolean =>
    !types || (dex[0].length === types.length && types.every((t) => dex[0].includes(t)));

  const name = (p.name ?? "").trim();
  const known = name
    ? resolveSpecies({ name, gender: p.gender ?? "", item: p.item ?? "" })
    : undefined;
  const currentDex = known?.baseDex;
  if (currentDex && fits(currentDex) && typesOk(currentDex)) return none;

  // 特性・実数値に合う種族の候補（名前 → 種族データ）
  const found = new Map<string, { dex: DexEntry; key: string }>();
  for (const key of BASE_DEX_KEYS) {
    const mark = key.endsWith("♂") ? "M" : key.endsWith("♀") ? "F" : "";
    if (mark && p.gender && p.gender !== mark) continue;
    if (fits(DEX[key])) found.set(stripGenderMark(key), { dex: DEX[key], key });
  }
  let pool = [...found.keys()];
  // 種族値が同じで姿だけ違うポケモン（ロトムのフォルムなど）は、タイプ→覚える技の順で絞る
  if (pool.length > 1 && types) {
    const byType = pool.filter((n) => typesOk((found.get(n) as { dex: DexEntry }).dex));
    if (byType.length >= 1) pool = byType;
  }
  if (pool.length > 1) {
    const moves = p.moves.map((m) => canonicalMove(m).name);
    const score = (n: string): number => {
      const learn = learnsetFor((found.get(n) as { key: string }).key);
      return learn ? moves.filter((m) => learn.includes(m)).length : 0;
    };
    const best = Math.max(...pool.map(score));
    const top = pool.filter((n) => score(n) === best);
    if (best > 0 && top.length >= 1 && top.length < pool.length) pool = top;
  }

  const label = `ポケモン${index}`;
  const typeMismatch = Boolean(currentDex && !typesOk(currentDex));
  if (pool.length === 1 && (!currentDex || statsComplete || typeMismatch)) {
    const to = pool[0];
    if (to === name) return none;
    return {
      entry: { ...p, name: to },
      fixes: [`${label}の名前「${name || "（空欄）"}」→「${to}」（ニックネーム・姿違いの可能性があるため、特性・実数値・タイプ・技から種族を特定）`],
      notes: [],
    };
  }
  if (!currentDex || (pool.length > 1 && statsComplete && !fits(currentDex))) {
    return {
      ...none,
      notes: [`${label}: 画面の名前「${name || "（空欄）"}」が特性・実数値と合わず、1匹に絞れませんでした（候補: ${pool.slice(0, 6).join("・")}${pool.length > 6 ? "…" : ""}）。ポケモン名を選んでください。`],
    };
  }
  return none;
}

/* ------------------------------------------------------------------ */
/* 名前の読み違いの自動補正（APIは呼ばない）                              */
/* ------------------------------------------------------------------ */

/**
 * AIが読み取った「ポケモン名・特性・技」の1文字の読み違いを、既知の名前表に近い名前へ直す。
 *   - ポケモン名: 種族の一覧（345種）
 *   - 特性: そのポケモンの特性（メガストーン持ちはメガシンカ前の種族の特性）。種族が分かるときだけ
 *   - 技: 技の一覧（511技）
 * 完全一致は直さない。近い候補が1つに絞れないとき、表に無いものは、読み取った文字のまま残す。
 */
export function snapExtracted(
  p: ExtractedPokemon,
  index: number,
): { entry: ExtractedPokemon; fixes: string[] } {
  const fixes: string[] = [];
  const who = (name?: string) => `ポケモン${index}${name ? `（${name}）` : ""}`;

  // ポケモン名
  let name = p.name;
  if (name && !(name in DEX) && !SPECIES_NAMES.includes(name)) {
    const m = closestMatch(name, SPECIES_NAMES);
    if (m && m.value !== name) {
      fixes.push(`${who()}の名前「${name}」→「${m.value}」`);
      name = m.value;
    }
  }

  // 特性（括弧付きの表記「かたいツメ(もうか)」はそのまま）
  let ability = p.ability;
  if (ability && !ability.includes("(")) {
    const sp = resolveSpecies({ name: name ?? "", gender: p.gender ?? "", item: p.item ?? "" });
    const candidates = (sp.isMega ? sp.baseDex : sp.dex)?.[1];
    if (candidates && !candidates.includes(ability)) {
      const m = closestMatch(ability, candidates, maxDistanceForAbilities);
      if (m && m.value !== ability) {
        fixes.push(`${who(name)}の特性「${ability}」→「${m.value}」`);
        ability = m.value;
      }
    }
  }

  // 技（そのポケモンが覚える技が分かるときは、まずその中から最も近い技を探す）
  const learn = name ? learnableMoves({ name, gender: p.gender ?? "", item: p.item ?? "" }) : undefined;
  const moves = p.moves.map((mv) => {
    if (!mv || mv in MOVE_TYPES) return mv;
    // 漢字表記・かなの種類違い（「ふ不意打ち」「不意打ち」→「ふいうち」）は、確実な対応で直す
    const c = canonicalMove(mv);
    if (c.kind !== "none") {
      if (c.kind === "alias") fixes.push(`${who(name)}の技「${mv}」→「${c.name}」`);
      return c.name;
    }
    const m = (learn && closestMatch(mv, learn)) || closestMatch(mv, MOVE_NAMES);
    if (m && m.value !== mv) {
      if (m.distance > 0) fixes.push(`${who(name)}の技「${mv}」→「${m.value}」`);
      return m.value;
    }
    return mv;
  });

  // 持ち物（「カイリュウナイト」→「カイリュナイト」など）
  let item = p.item;
  if (item) {
    const c = canonicalItem(item, name ?? "");
    if (c.kind === "snap") fixes.push(`${who(name)}の持ち物「${item}」→「${c.name}」`);
    if (c.kind !== "none") item = c.name;
  }

  return { entry: { ...p, name, ability, moves, item }, fixes };
}

export interface CheckedTeam {
  forms: PokemonForm[];
  /** 名前の読み違いを自動で直した内容（例: ポケモン4（アシレーヌ）の技「うたたたのアリア」→「うたかたのアリア」） */
  corrections: string[];
  /** 読み取り結果と計算の食い違い・自動補正の内容（画面に表示する） */
  notes: string[];
}

/**
 * AIの抽出結果を編集用フォームにする。種族が分かるポケモンは、
 *  1. 読み取った実数値と計算値を照合し、性格の矢印の読み違いが実数値から確定できれば性格を直す
 *  2. 実数値を計算値に入れ直す（スライダーの値と常に一致させる）
 *  3. それでも画面の実数値と合わない項目は、notes で知らせる
 */
export function toCheckedTeamForms(list: ExtractedPokemon[]): CheckedTeam {
  const forms: PokemonForm[] = [];
  const notes: string[] = [];
  const corrections: string[] = [];

  list.slice(0, MAX_TEAM_SIZE).forEach((raw0, i) => {
    // 1匹ずつの画面は持ち物が出ない。メガシンカ後の姿が表示されていれば、そのメガストーンを持ち物にする
    const stone = !raw0.item && raw0.megaForm ? stoneForMega(raw0.megaForm) : undefined;
    // メガシンカ後の姿が表示されている画面は、実数値も特性もメガシンカ「後」の値になっている
    //（チーム画面は、メガストーンを持っていてもメガシンカ前の値）
    const screenMega = Boolean(stone && raw0.megaForm && raw0.megaForm in MEGA_ABILITIES);
    let raw = stone ? { ...raw0, item: stone } : raw0;
    if (screenMega && raw0.megaForm) {
      const baseName = baseFormName(raw0.megaForm);
      const name = raw.name && lookupDex(raw.name, raw.gender ?? "") ? raw.name : baseName;
      const abilities = lookupDex(name, raw.gender ?? "")?.[1] ?? [];
      let ability = raw.ability;
      // 画面に出ているのはメガシンカ後の特性。出力に必要な「元の特性」は画面から分からないので、
      // 1つしか持たないポケモンならそれを入れ、複数あれば空欄にして選んでもらう
      if (ability && !abilities.includes(ability)) {
        ability = abilities.length === 1 ? abilities[0] : undefined;
        if (!ability) {
          notes.push(
            `ポケモン${i + 1}（${name}）: 画面にはメガシンカ後の特性が出ているため、メガシンカ前の特性が分かりません。特性の欄で選んでください。`,
          );
        }
      }
      raw = { ...raw, name, ability };
    }
    const ident = screenMega ? { entry: raw, fixes: [] as string[], notes: [] as string[] } : identifySpecies(raw, i + 1);
    corrections.push(...ident.fixes);
    notes.push(...ident.notes);
    const snapped = snapExtracted(ident.entry, i + 1);
    corrections.push(...snapped.fixes);
    const p = snapped.entry;
    let form = applyExtraction(createEmptyForm(), p);
    const sp = resolveSpecies(form);
    const label = `ポケモン${i + 1}${form.name ? `（${form.name}）` : ""}`;

    if (sp.dex) {
      const read = { ...form.stats };
      const hasRead = STAT_KEYS.every((k) => read[k] !== "");
      // ゲーム画面の実数値は、メガストーンを持っていてもメガシンカ「前」の値。
      // 照合・性格の逆算はメガシンカ前の種族値で行い、最後にメガシンカ後の値へ入れ直す。
      const screenBase = (screenMega && sp.isMega ? sp.dex : (sp.baseDex ?? sp.dex))[2];

      if (hasRead) {
        const inferred = inferNatureFromStats(screenBase, read, form.evs);
        if (inferred && inferred !== form.nature) {
          notes.push(
            form.nature
              ? `${label}の性格を、画面の実数値に合わせて「${form.nature}」から「${inferred}」に直しました。`
              : `${label}の性格を、画面の実数値から「${inferred}」と判定しました。`,
          );
          form = { ...form, nature: inferred };
        }

        if (form.nature) {
          const c = computeStats(screenBase, form.evs, form.nature);
          const diffs = STAT_KEYS.filter((k) => String(c[k]) !== read[k]).map(
            (k) => `${STAT_LABEL_JA[k]} 画面${read[k]}／計算${c[k]}`,
          );
          if (diffs.length > 0) {
            notes.push(
              `${label}: 画面の実数値と計算が合いません（${diffs.join("、")}）。能力ポイントや性格の読み取り違いかもしれません。確認してください。`,
            );
          }
        } else {
          notes.push(
            `${label}: 性格を読み取れなかったため、実数値は画面の値のままにしています。性格を選ぶと、実数値を計算し直します。`,
          );
        }
      }

      form = syncStats(form);
    }
    forms.push(form);
  });

  return { forms, notes, corrections };
}
