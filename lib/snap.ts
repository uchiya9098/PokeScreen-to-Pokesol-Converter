/**
 * AIが画像から読み取った名前（技・特性・ポケモン名）の「1文字の読み違い」を、既知の名前表への
 * 最近傍マッチで直す。APIは呼ばない（トークン消費ゼロ）。
 *
 *   例: 「うたたたのアリア」→「うたかたのアリア」
 *
 * 安全のため、次の条件をすべて満たすときだけ直す（満たさなければ読み取った文字のまま残す）。
 *   - 表に完全一致する名前は、そのまま（直さない）
 *   - 編集距離（挿入・削除・置換の最少回数）が小さい（名前が長いほど許す回数が増える）
 *   - いちばん近い候補が1つだけ（同じ近さの候補が複数あるときは直さない）
 * 比較は、カタカナとひらがなの違い・空白・「・」を無視して行う。
 */

/** カタカナ→ひらがな、全角→半角などをそろえ、空白と「・」を除く（比較用） */
export function foldKana(s: string): string {
  return s
    .normalize("NFKC")
    // 長音「ー」の取り違え（ハイフン・ダッシュ・マイナス・漢数字の「一」）をそろえる
    .replace(/[\u2010-\u2015\u2212\uFF0D\uFF70-]|(?<=[ぁ-ヺ])一/g, "ー")
    // かなとそっくりな漢字（力・夕・卜・口・工・二・八）をかなにそろえる（AIが取り違えやすい）
    .replace(/[力夕卜口工二八]/g, (c) => ({ 力: "カ", 夕: "タ", 卜: "ト", 口: "ロ", 工: "エ", 二: "ニ", 八: "ハ" })[c] as string)
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･]/g, "");
}

/** 編集距離（レーベンシュタイン距離） */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 名前の長さ（かな換算）に応じた、直してよい文字数。短い名前は誤補正が怖いので許さない。 */
export const maxDistanceForNames = (len: number): number => (len <= 3 ? 0 : len <= 6 ? 1 : 2);
/** 特性は候補が少ない・種族データの精度に依存するため、1文字違いまでに限る */
export const maxDistanceForAbilities = (len: number): number => (len <= 3 ? 0 : 1);

export interface Match {
  value: string;
  distance: number;
}

/**
 * 候補の中から、入力にいちばん近いものを返す。完全一致（かな違い含む）は距離0で返す。
 * 許容距離を超える／同じ近さの候補が複数ある場合は undefined。
 */
export function closestMatch(
  input: string,
  candidates: readonly string[],
  maxDistance: (len: number) => number = maxDistanceForNames,
): Match | undefined {
  const folded = foldKana(input);
  if (!folded) return undefined;
  const limit = maxDistance(folded.length);

  let best: Match | undefined;
  let tie = false;
  for (const c of candidates) {
    const fc = foldKana(c);
    // 長さがあまりに違えば、距離を計算するまでもなく対象外
    if (Math.abs(fc.length - folded.length) > limit) continue;
    const d = editDistance(folded, fc);
    if (d > limit) continue;
    if (d === 0) return { value: c, distance: 0 };
    if (!best || d < best.distance) {
      best = { value: c, distance: d };
      tie = false;
    } else if (d === best.distance && c !== best.value) {
      tie = true;
    }
  }
  return best && !tie ? best : undefined;
}
