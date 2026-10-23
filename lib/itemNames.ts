/**
 * 持ち物を「ポケモンチャンピオンズに登場する表記」にそろえる（技名の lib/moveNames.ts と同じ考え方）。
 * AIの読み違い（例: 「カイリュウナイト」→正しくは「カイリュナイト」）を、既知の名前表への照合で直す。
 * 出典: GameWith・Gamerch のチャンピオンズ持ち物一覧（2026-10取得）。表に無い持ち物は直さず、そのまま残す。
 * 新しい持ち物が増えたら ITEMS に1行足す。
 */
import { closestMatch } from "./snap";
import { foldKana } from "./snap";

/** メガストーン。名前は「ポケモン名の語尾を縮めた形＋ナイト」（カイリュー→カイリュナイト など） */
export const MEGA_STONES: readonly string[] = [
  "フシギバナイト",
  "リザードナイトX",
  "リザードナイトY",
  "カメックスナイト",
  "スピアナイト",
  "ピジョットナイト",
  "ピクシナイト",
  "フーディナイト",
  "ウツボットナイト",
  "ヤドランナイト",
  "ゲンガナイト",
  "ガルーラナイト",
  "スターミナイト",
  "カイロスナイト",
  "プテラナイト",
  "ギャラドスナイト",
  "カイリュナイト",
  "メガニウムナイト",
  "オーダイルナイト",
  "デンリュウナイト",
  "ハガネールナイト",
  "ハッサムナイト",
  "ヘラクロスナイト",
  "エアームドナイト",
  "ヘルガナイト",
  "バンギラスナイト",
  "サーナイトナイト",
  "ヤミラミナイト",
  "チャーレムナイト",
  "ボスゴドラナイト",
  "ライボルトナイト",
  "サメハダナイト",
  "バクーダナイト",
  "チルタリスナイト",
  "ジュペッタナイト",
  "チリーンナイト",
  "アブソルナイト",
  "オニゴーリナイト",
  "ミミロップナイト",
  "ガブリアスナイト",
  "ルカリオナイト",
  "ユキノオナイト",
  "エルレイドナイト",
  "ユキメノコナイト",
  "エンブオナイト",
  "ドリュウズナイト",
  "タブンネナイト",
  "シャンデラナイト",
  "ゴルーグナイト",
  "ニャオニクスナイト",
  "ブリガロナイト",
  "マフォクシナイト",
  "ゲッコウガナイト",
  "フラエッテナイト",
  "ルチャブルナイト",
  "ケケンカニナイト",
  "ジジーロナイト",
  "スコヴィラナイト",
  "キラフロルナイト",
  "ガブリアスナイトZ",
  "ルカリオナイトZ",
  "アブソルナイトZ",
];

export const ITEMS: readonly string[] = [
  "たべのこし",
  "いのちのたま",
  "きあいのタスキ",
  "こだわりスカーフ",
  "ゴツゴツメット",
  "ふうせん",
  "オボンのみ",
  "ひかりのねんど",
  "レッドカード",
  "エレキシード",
  "ラムのみ",
  "シルクのスカーフ",
  "つめたいいわ",
  "しろいハーブ",
  "ピントレンズ",
  "こうかくレンズ",
  "だっしゅつボタン",
  "オッカのみ",
  "こだわりハチマキ",
  "こだわりメガネ",
  "ひかりのこな",
  "せんせいのツメ",
  "メンタルハーブ",
  "おうじゃのしるし",
  "ぎんのこな",
  "きあいのハチマキ",
  "メタルコート",
  "やわらかいすな",
  "かたいいし",
  "きせきのタネ",
  "くろいメガネ",
  "くろおび",
  "じしゃく",
  "しんぴのしずく",
  "するどいくちばし",
  "どくバリ",
  "とけないこおり",
  "のろいのおふだ",
  "まがったスプーン",
  "もくたん",
  "りゅうのキバ",
  "かいがらのすず",
  "ようせいのハネ",
  "でんきだま",
  "クラボのみ",
  "カゴのみ",
  "モモンのみ",
  "チーゴのみ",
  "ナナシのみ",
  "ヒメリのみ",
  "オレンのみ",
  "キーのみ",
  "イトケのみ",
  "ソクノのみ",
  "リンドのみ",
  "ヤチェのみ",
  "ヨプのみ",
  "ビアーのみ",
  "シュカのみ",
  "バコウのみ",
  "ウタンのみ",
  "タンガのみ",
  "ヨロギのみ",
  "カシブのみ",
  "ハバンのみ",
  "ナモのみ",
  "リリバのみ",
  "ロゼルのみ",
  "ホズのみ",
  ...MEGA_STONES,
];

const FOLDED = new Map<string, string>(ITEMS.map((i) => [foldKana(i), i]));

/** 持ち物の読み違いで直してよい文字数。短い名前は誤補正が怖いので許さない */
const maxDistanceForItems = (len: number): number => (len <= 4 ? 0 : 1);
const maxDistanceForStones = (len: number): number => (len <= 5 ? 0 : 2);

export type ItemMatchKind = "exact" | "kana" | "snap" | "none";

/**
 * 持ち物名をチャンピオンズの表記にする。
 *  - 表のとおり／かなの種類違い → そのまま・統一
 *  - メガストーン（○○ナイト）: 種族名が分かれば、その先頭2文字が合うストーンの中から最も近い1つ（2文字違いまで）
 *  - それ以外: 最も近い1つ（1文字違いまで。同じ近さが複数なら直さない）
 */
export function canonicalItem(raw: string, species = ""): { name: string; kind: ItemMatchKind } {
  const s = raw.normalize("NFKC").trim().replace(/(ナイト)([xyz])$/, (_, a, b) => a + b.toUpperCase());
  if (!s) return { name: raw, kind: "none" };
  if (ITEMS.includes(s)) return { name: s, kind: "exact" };
  const folded = FOLDED.get(foldKana(s));
  if (folded) return { name: folded, kind: "kana" };

  if (/ナイト[XYZ]?$/.test(s)) {
    const head = species.replace(/^メガ/, "").slice(0, 2);
    // X/Y/Z の付き方は読み違えない前提で、同じ付き方のストーンだけを候補にする（ガブリアスナイトZ→ガブリアスナイト、にはしない）
    const suffix = s.match(/[XYZ]$/)?.[0] ?? "";
    const same = MEGA_STONES.filter((x) => (x.match(/[XYZ]$/)?.[0] ?? "") === suffix);
    const pool = head ? same.filter((x) => x.startsWith(head)) : same;
    const m = closestMatch(s, pool.length ? pool : same, maxDistanceForStones);
    if (m) return { name: m.value, kind: "snap" };
    return { name: raw, kind: "none" };
  }
  const m = closestMatch(s, ITEMS, maxDistanceForItems);
  return m ? { name: m.value, kind: m.distance === 0 ? "kana" : "snap" } : { name: raw, kind: "none" };
}

/** そのポケモンのメガストーン（種族名の先頭2文字が合うもの）。UIの持ち物候補で先頭に出す */
export function stonesFor(species: string): string[] {
  const head = species.replace(/^メガ/, "").replace(/\(.+\)$/, "").slice(0, 2);
  return head.length === 2 ? MEGA_STONES.filter((x) => x.startsWith(head)) : [];
}

/**
 * メガシンカ後の名前（例: メガガブリアスZ）から、そのメガストーン（ガブリアスナイトZ）を求める。
 * 1匹ずつの画面は持ち物を表示しないが、メガシンカ後の姿が表示されていれば、持たせているストーンが分かる。
 * 表にあるストーンだけを返す（無ければ undefined）。
 */
export function stoneForMega(megaName: string): string | undefined {
  const m = megaName.normalize("NFKC").trim().match(/^メガ(.+?)([XYZ])?$/);
  if (!m) return undefined;
  const base = m[1];
  const suffix = m[2] ?? "";
  const stems = [base, base.replace(/[ーン]$/, "")];
  for (const stem of stems) {
    const hit = MEGA_STONES.find((x) => x === `${stem}ナイト${suffix}`);
    if (hit) return hit;
  }
  const head = base.slice(0, 2);
  const same = MEGA_STONES.filter((x) => x.startsWith(head) && (x.match(/[XYZ]$/)?.[0] ?? "") === suffix);
  return same.length === 1 ? same[0] : undefined;
}
