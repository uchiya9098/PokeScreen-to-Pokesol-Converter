import { learnableMoves, resolveSpecies } from "./calc";
import { canonicalItem } from "./itemNames";
import { canonicalMove } from "./moveNames";
import { CONVERT_MEGA, megaFor } from "./mega";
import { canonicalGenderMark, genderMatters, hasGenderMark, isMegaName } from "./species";
import { MAX_EV_PER_STAT, MAX_EV_TOTAL, STAT_KEYS, type Gender, type PokemonForm } from "./types";

/** ポケモンごとの努力値（能力ポイント）の上限と合計の上限（定義は types.ts） */
export { MAX_EV_PER_STAT, MAX_EV_TOTAL };

/** 性別の表記。ポケソルの形式が変わったらここだけ直す（例: "(♂)" → " (M)"） */
const GENDER_MARK = { M: "♂", F: "♀" } as const;

const toInt = (v: string): number => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const filledMoves = (form: PokemonForm): string[] =>
  form.moves.map((m) => m.trim()).filter(Boolean);

/** 出力する技名は、ポケモンチャンピオンズの表記にそろえる（表に無い技はそのまま） */
const outputMoves = (form: PokemonForm): string[] =>
  filledMoves(form).map((m) => canonicalMove(m).name);

/** 実数値が6項目すべてそろっているか */
const hasAllStats = (form: PokemonForm): boolean =>
  STAT_KEYS.every((k) => toInt(form.stats[k]) > 0);

/* ------------------------------------------------------------------ */
/* ポケソルテキストの組み立て                                          */
/*                                                                    */
/*   1行目  ポケモン名 @ 持ち物                                          */
/*          性別が必要な種族だけ イダイトウ(♂) ／ メガニャオニクス♂（メガは括弧なし） */
/*          姿違いは ゾロアーク(ヒスイ) @ 持ち物 ／ パンプジン(大) @ 持ち物   */
/*          メガストーン持ちは メガリザードンX @ リザードナイトX            */
/*   2行目  特性: 特性名                                               */
/*   3行目  能力補正: 性格名                                           */
/*   4行目  H-A-B-C-D-S を「実数値(努力値)」でハイフン区切り            */
/*          努力値が0の項目は括弧を省略  例: 215(32)-132-187(32)-79-93(1)-68(1) */
/*   5行目  技を「 / 」区切り                                          */
/*   複数匹は、ポケモンの間に空行を1つ入れる                           */
/*                                                                    */
/* 取り込み仕様が変わった場合は、この関数だけを直せば済みます。          */
/* ------------------------------------------------------------------ */

/** 4行目: 「実数値(努力値)」を H-A-B-C-D-S の順にハイフンでつなぐ。6項目そろわなければ null */
function statLine(form: PokemonForm): string | null {
  if (!hasAllStats(form)) return null;
  return STAT_KEYS.map((k) => {
    const stat = toInt(form.stats[k]);
    const ev = toInt(form.evs[k]);
    return ev > 0 ? `${stat}(${ev})` : `${stat}`;
  }).join("-");
}

/** 性別が必要な種族なら、名前に性別の印を付ける。すでに付いていれば重ねない。 */
function withGender(name: string, gender: Gender): string {
  if (!gender || !genderMatters(name) || hasGenderMark(name)) return name;
  const mark = GENDER_MARK[gender];
  return isMegaName(name) ? `${name}${mark}` : `${name}(${mark})`;
}

/** 1匹分のポケソルテキストを生成。ポケモン名が未入力なら空文字。 */
export function buildPokesolText(form: PokemonForm): string {
  // 名前に「(M)」「(F)」「(オス)」「(メス)」が混ざっていても、出力は「(♂)」「(♀)」にする
  const name = canonicalGenderMark(form.name.trim());
  if (!name) return "";

  const lines: string[] = [];

  const item = canonicalItem(form.item.trim(), name).name;
  const baseAbility = form.ability.trim();
  // メガストーン持ちは、メガシンカ後の名前・特性（メガリザードンX / かたいツメ(もうか)）に変換する
  const mega = CONVERT_MEGA ? megaFor(name, item) : null;
  // 性別は、性別で姿・特性・技が変わる種族（lib/species.ts の GENDER_MATTERS）だけ付ける。
  //   通常の姿: イダイトウ(♂)　／　メガシンカ: メガニャオニクス♂（括弧なし）
  const head = withGender(mega ? mega.name : name, form.gender);
  lines.push(item ? `${head} @ ${item}` : head);

  const ability =
    mega && !baseAbility.includes("(")
      ? baseAbility
        ? `${mega.megaAbility}(${baseAbility})`
        : mega.megaAbility
      : baseAbility;
  if (ability) lines.push(`特性: ${ability}`);

  if (form.nature) lines.push(`能力補正: ${form.nature}`);

  const stats = statLine(form);
  if (stats) lines.push(stats);

  const moves = outputMoves(form);
  if (moves.length > 0) lines.push(moves.join(" / "));

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* チーム（複数匹）                                                    */
/* ------------------------------------------------------------------ */

/** 何か入力されているか（空のスロットを出力・警告から除くために使う） */
export function hasContent(form: PokemonForm): boolean {
  return (
    Boolean(form.name.trim() || form.item.trim() || form.ability.trim()) ||
    filledMoves(form).length > 0 ||
    STAT_KEYS.some((k) => form.stats[k].trim() || form.evs[k].trim())
  );
}

/** チーム全員分のテキスト。名前のあるポケモンだけを、空行1つで区切って並べる。 */
export function buildTeamText(team: PokemonForm[]): string {
  return team
    .map((p) => buildPokesolText(p))
    .filter((t) => t.length > 0)
    .join("\n\n");
}

/** 出力に含まれるポケモンの数 */
export function countExportable(team: PokemonForm[]): number {
  return team.filter((p) => p.name.trim().length > 0).length;
}

/** 1匹分について、出力前に注意喚起すべき点を列挙する（エラーではなく警告） */
export function validateForm(form: PokemonForm): string[] {
  const warnings: string[] = [];

  if (!form.name.trim()) warnings.push("ポケモン名が未入力です。");
  else if (genderMatters(form.name) && !form.gender && !hasGenderMark(form.name.trim())) {
    warnings.push("このポケモンは性別で姿や技が変わるため、性別を選んでください（未選択だと性別なしで出力されます）。");
  }
  if (!form.ability.trim()) warnings.push("特性が未入力のため、特性の行は出力されません。");
  if (!form.nature) warnings.push("性格が未選択のため、能力補正の行は出力されません。");

  if (!hasAllStats(form)) {
    warnings.push("実数値が6項目そろっていないため、ステータスの行は出力されません。");
  }

  if (resolveSpecies(form).dex && STAT_KEYS.every((k) => toInt(form.evs[k]) === 0)) {
    warnings.push("能力ポイントが1つも振られていません（実数値は種族値のままで出力されます）。");
  }

  const moves = filledMoves(form);
  if (moves.length === 0) warnings.push("技が1つも入力されていないため、技の行は出力されません。");
  if (new Set(moves).size !== moves.length) warnings.push("同じ技が重複しています。");
  const learn = learnableMoves(form);
  if (learn) {
    const unknown = moves.filter((m) => !learn.includes(canonicalMove(m).name));
    if (unknown.length > 0) {
      warnings.push(`${unknown.map((m) => `「${m}」`).join("")}は、このポケモンが覚える技の一覧にありません（表記違いか、データの未収録かもしれません）。`);
    }
  }

  const evValues = STAT_KEYS.map((k) => toInt(form.evs[k]));
  if (evValues.some((v) => v > MAX_EV_PER_STAT)) {
    warnings.push(`努力値は1項目あたり${MAX_EV_PER_STAT}までです。`);
  }
  const total = evValues.reduce((a, b) => a + b, 0);
  if (total > MAX_EV_TOTAL) {
    warnings.push(`努力値の合計が${MAX_EV_TOTAL}を超えています（現在 ${total}）。`);
  }
  return warnings;
}

export interface TeamIssue {
  /** 0始まりのスロット番号 */
  index: number;
  messages: string[];
}

/** チーム全体の警告。中身のあるスロットだけを検査し、スロットごとにまとめて返す。 */
export function validateTeam(team: PokemonForm[]): TeamIssue[] {
  const issues: TeamIssue[] = [];
  team.forEach((p, index) => {
    if (!hasContent(p)) return;
    const messages = validateForm(p);
    if (messages.length > 0) issues.push({ index, messages });
  });
  return issues;
}
