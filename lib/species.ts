/**
 * ポケモン名まわりのルール（性別の表記が必要な種族・姿違いの表記ゆれの正規化）。
 * 表記の仕様が変わったら、このファイルを直せば済みます。
 */

/**
 * 性別によって姿・特性・覚える技が変わるため、ポケソルテキストに性別を明記する種族。
 * ここに無い種族は、画面に性別アイコンがあっても性別は出力しない。
 * （種族を足したいときは、基本の名前だけを書く。「イダイトウ(♂)」のようには書かない）
 */
export const GENDER_MATTERS: readonly string[] = [
  "イダイトウ", // ♂/♀ で姿・特性・技が異なる
  "ニャオニクス", // ♂/♀ で特性・技が異なる
  "イエッサン", // ♂/♀ で特性が異なる
  "パフュートン", // ♂/♀ で特性・技が異なる
];

/** 地域の姿（括弧書きで付記する） */
export const REGION_FORMS: readonly string[] = ["アローラ", "ガラル", "ヒスイ", "パルデア"];

/** 括弧書きの付記（姿・性別）を除いた、基本の種族名 */
export function baseSpeciesName(name: string): string {
  return name.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim();
}

/** メガシンカ後の名前か（メガリザードンX など） */
export const isMegaName = (name: string): boolean => name.startsWith("メガ");

/** 名前の末尾に性別の印（(♂) (♀) (M) (F) ♂ ♀）がすでに付いているか */
export const hasGenderMark = (name: string): boolean =>
  /(?:[(（]\s*(?:♂|♀|M|F|オス|メス|雄|雌)\s*[)）]|[♂♀])\s*$/.test(name);

const MALE_MARKS = ["♂", "M", "オス", "雄"];

/**
 * 名前の末尾の「(M)」「(F)」「(オス)」「(メス)」を、ポケソルの表記「(♂)」「(♀)」にそろえる。
 * （AIの返答や手入力に M/F などの文字が混ざっていても、出力は必ず記号になる）
 */
export function canonicalGenderMark(name: string): string {
  return name.replace(
    /[(（]\s*(♂|♀|M|F|オス|メス|雄|雌)\s*[)）]\s*$/,
    (_, g: string) => `(${MALE_MARKS.includes(g) ? "♂" : "♀"})`,
  );
}

/**
 * この種族は、性別を出力する必要があるか。
 * メガシンカ後の名前（メガニャオニクス など）も、元の種族で判定する。
 */
export function genderMatters(name: string): boolean {
  const base = baseSpeciesName(name).replace(/^メガ/, "").replace(/[XYZ]$/, "");
  return GENDER_MATTERS.includes(base);
}

const REGION_RE = REGION_FORMS.join("|");

/**
 * AIが返した名前を「種族名(姿)」の形にそろえる。性別記号が混ざっていれば取り出す。
 *   ヒスイのすがた ゾロアーク / ゾロアーク ヒスイのすがた / ゾロアーク（ヒスイ）→ ゾロアーク(ヒスイ)
 *   イダイトウ♂ / イダイトウ(♂) → 名前は「イダイトウ」、性別は M
 * 姿の指定が地域以外（例: ケンタロス(パルデア・コンバット種)）のときは、そのまま残す。
 * 入力は NFKC 正規化済み（全角括弧は半角になっている）を想定。
 */
export function normalizeSpeciesName(raw: string): { name: string; gender?: "M" | "F" } {
  let name = raw.normalize("NFKC").trim();
  let gender: "M" | "F" | undefined;

  // 末尾の性別表記を取り出す: 「イダイトウ♂」「イダイトウ(♂)」「イダイトウ(M)」「イダイトウ(オス)」
  const g = name.match(/\s*(?:[(（]\s*(♂|♀|M|F|オス|メス|雄|雌)\s*[)）]|(♂|♀))\s*$/);
  if (g) {
    gender = MALE_MARKS.includes(g[1] ?? g[2]) ? "M" : "F";
    name = name.slice(0, g.index).trim();
  }

  // ロトムのフォルム: 「ヒートロトム」「ロトム(ヒート)」「ロトム(ほのお)」→「ロトム(炎)」（ポケソルの表記）
  const rotom = normalizeRotom(name);
  if (rotom) return { name: rotom, gender };

  // サイズ違い（パンプジン／バケッチャ）: 「パンプジン(おおきいサイズ)」→「パンプジン(大)」
  // 「ふつう（中）」のサイズは、姿の付記なしの通常のすがたとして扱う。
  const size = name.match(
    /^(パンプジン|バケッチャ)\s*\(?\s*(ちいさい|ふつう|おおきい|とくだい|小|中|大|特大)(?:な?サイズ|の?すがた)?\s*\)?$/,
  );
  if (size) {
    const label: Record<string, string> = {
      ちいさい: "小", 小: "小", おおきい: "大", 大: "大", とくだい: "特大", 特大: "特大",
    };
    const mark = label[size[2]];
    return { name: mark ? `${size[1]}(${mark})` : size[1], gender };
  }

  // 前置き: 「ヒスイのすがた ゾロアーク」「ヒスイゾロアーク」
  const prefix = name.match(new RegExp(`^(${REGION_RE})(?:の?すがた)?[ ・]?(.+)$`));
  if (prefix) {
    name = `${prefix[2].trim()}(${prefix[1]})`;
  } else {
    // 後置き: 「ゾロアーク ヒスイのすがた」「ゾロアーク(ヒスイのすがた)」
    const suffix = name.match(new RegExp(`^(.+?)\\s*\\(?\\s*(${REGION_RE})(?:の?すがた)?\\s*\\)?$`));
    if (suffix) name = `${suffix[1].trim()}(${suffix[2]})`;
  }
  return { name, gender };
}

/** ロトムのフォルム名（ポケソルの表記は「ロトム(炎)」「ロトム(水)」「ロトム(氷)」「ロトム(飛)」「ロトム(草)」） */
const ROTOM_FORMS: Record<string, string> = {
  ヒート: "炎", ほのお: "炎", 炎: "炎",
  ウォッシュ: "水", みず: "水", 水: "水",
  フロスト: "氷", こおり: "氷", 氷: "氷",
  スピン: "飛", ひこう: "飛", 飛: "飛",
  カット: "草", くさ: "草", 草: "草",
};
const ROTOM_KEYS = Object.keys(ROTOM_FORMS).join("|");

/** ロトムのフォルム表記ゆれを「ロトム(炎)」の形にそろえる。ロトムでなければ undefined */
export function normalizeRotom(name: string): string | undefined {
  const a = name.match(new RegExp(`^(${ROTOM_KEYS})ロトム$`));
  if (a) return `ロトム(${ROTOM_FORMS[a[1]]})`;
  const b = name.match(new RegExp(`^ロトム\\s*[(（]?\\s*(${ROTOM_KEYS})(?:ロトム|フォルム|のすがた)?\\s*[)）]?$`));
  if (b) return `ロトム(${ROTOM_FORMS[b[1]]})`;
  return undefined;
}
