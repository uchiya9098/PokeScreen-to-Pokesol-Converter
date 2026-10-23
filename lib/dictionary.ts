import type { StatKey } from "./types";

export interface TypeInfo {
  ja: string;
  en: string;
}

export const TYPES: TypeInfo[] = [
  { ja: "ノーマル", en: "Normal" },
  { ja: "ほのお", en: "Fire" },
  { ja: "みず", en: "Water" },
  { ja: "でんき", en: "Electric" },
  { ja: "くさ", en: "Grass" },
  { ja: "こおり", en: "Ice" },
  { ja: "かくとう", en: "Fighting" },
  { ja: "どく", en: "Poison" },
  { ja: "じめん", en: "Ground" },
  { ja: "ひこう", en: "Flying" },
  { ja: "エスパー", en: "Psychic" },
  { ja: "むし", en: "Bug" },
  { ja: "いわ", en: "Rock" },
  { ja: "ゴースト", en: "Ghost" },
  { ja: "ドラゴン", en: "Dragon" },
  { ja: "あく", en: "Dark" },
  { ja: "はがね", en: "Steel" },
  { ja: "フェアリー", en: "Fairy" },
  { ja: "ステラ", en: "Stellar" },
];

export interface NatureInfo {
  ja: string;
  en: string;
  plus?: StatKey;
  minus?: StatKey;
}

export const NATURES: NatureInfo[] = [
  { ja: "がんばりや", en: "Hardy" },
  { ja: "さみしがり", en: "Lonely", plus: "atk", minus: "def" },
  { ja: "ゆうかん", en: "Brave", plus: "atk", minus: "spe" },
  { ja: "いじっぱり", en: "Adamant", plus: "atk", minus: "spa" },
  { ja: "やんちゃ", en: "Naughty", plus: "atk", minus: "spd" },
  { ja: "ずぶとい", en: "Bold", plus: "def", minus: "atk" },
  { ja: "すなお", en: "Docile" },
  { ja: "のんき", en: "Relaxed", plus: "def", minus: "spe" },
  { ja: "わんぱく", en: "Impish", plus: "def", minus: "spa" },
  { ja: "のうてんき", en: "Lax", plus: "def", minus: "spd" },
  { ja: "おくびょう", en: "Timid", plus: "spe", minus: "atk" },
  { ja: "せっかち", en: "Hasty", plus: "spe", minus: "def" },
  { ja: "まじめ", en: "Serious" },
  { ja: "ようき", en: "Jolly", plus: "spe", minus: "spa" },
  { ja: "むじゃき", en: "Naive", plus: "spe", minus: "spd" },
  { ja: "ひかえめ", en: "Modest", plus: "spa", minus: "atk" },
  { ja: "おっとり", en: "Mild", plus: "spa", minus: "def" },
  { ja: "れいせい", en: "Quiet", plus: "spa", minus: "spe" },
  { ja: "てれや", en: "Bashful" },
  { ja: "うっかりや", en: "Rash", plus: "spa", minus: "spd" },
  { ja: "おだやか", en: "Calm", plus: "spd", minus: "atk" },
  { ja: "おとなしい", en: "Gentle", plus: "spd", minus: "def" },
  { ja: "なまいき", en: "Sassy", plus: "spd", minus: "spe" },
  { ja: "しんちょう", en: "Careful", plus: "spd", minus: "spa" },
  { ja: "きまぐれ", en: "Quirky" },
];

export const typeJaToEn = (ja: string): string =>
  TYPES.find((t) => t.ja === ja)?.en ?? ja;

export const natureJaToEn = (ja: string): string =>
  NATURES.find((n) => n.ja === ja)?.en ?? ja;
