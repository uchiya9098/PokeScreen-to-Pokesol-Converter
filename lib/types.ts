/** 6つの能力値キー */
export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** フォーム上では入力しやすいよう、数値も文字列で保持する */
export type StatRecord = Record<StatKey, string>;

export const STAT_LABEL_JA: Record<StatKey, string> = {
  hp: "HP",
  atk: "こうげき",
  def: "ぼうぎょ",
  spa: "とくこう",
  spd: "とくぼう",
  spe: "すばやさ",
};

/** 日本語圏でよく使われる略称（H/A/B/C/D/S） */
export const STAT_SHORT: Record<StatKey, string> = {
  hp: "H",
  atk: "A",
  def: "B",
  spa: "C",
  spd: "D",
  spe: "S",
};

/** Pokémon Showdown 形式の略称 */
export const STAT_SHOWDOWN: Record<StatKey, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

export type MoveSlots = [string, string, string, string];

/** 能力ポイント（努力値）の上限: 1項目あたり32、合計66 */
export const MAX_EV_PER_STAT = 32;
export const MAX_EV_TOTAL = 66;

/** 1チームに含められるポケモンの最大数 */
export const MAX_TEAM_SIZE = 6;

/** 解析のモード。team=チーム画面（能力・ステータスの2枚）、single=1匹ずつの詳細画面（最大6枚） */
export type AnalyzeMode = "team" | "single";

/** 性別。"M"=オス, "F"=メス, ""=性別なし／不明 */
export type Gender = "" | "M" | "F";

/** 手動修正フォームの状態（1匹分） */
export interface PokemonForm {
  name: string;
  gender: Gender;
  item: string;
  ability: string;
  /** 日本語のタイプ名（例: "ほのお"）。未設定は "" */
  teraType: string;
  /** 日本語の性格名（例: "ようき"）。未設定は "" */
  nature: string;
  level: string;
  moves: MoveSlots;
  /** 実数値 */
  stats: StatRecord;
  /** 努力値 */
  evs: StatRecord;
}

export const emptyStatRecord = (): StatRecord => ({
  hp: "",
  atk: "",
  def: "",
  spa: "",
  spd: "",
  spe: "",
});

export const createEmptyForm = (): PokemonForm => ({
  name: "",
  gender: "",
  item: "",
  ability: "",
  teraType: "",
  nature: "",
  level: "50",
  moves: ["", "", "", ""],
  stats: emptyStatRecord(),
  evs: emptyStatRecord(),
});

/** AIが画像から抽出した内容（サニタイズ済み）。画面に表示されていなかった項目は未定義/空。 */
export interface ExtractedPokemon {
  /** 画面上のタイル番号（1〜6）。読み取れた場合のみ */
  slot?: number;
  name?: string;
  gender?: "M" | "F";
  item?: string;
  ability?: string;
  /** 名前の横に並ぶタイプアイコン（種族のタイプ。1〜2個）。ロトムなど、同じ種族値で姿が違うポケモンの見分けに使う */
  types?: string[];
  teraType?: string;
  nature?: string;
  level?: string;
  /** 1匹ずつの画面に「メガガブリアスZ」のように表示されているメガシンカ後の名前（持ち物の推定に使う） */
  megaForm?: string;
  moves: string[];
  stats: Partial<StatRecord>;
  evs: Partial<StatRecord>;
}

export type AiProvider = "gemini";

/** /api/analyze のエラーコード */
export type AnalyzeErrorCode =
  | "bad_request"
  | "forbidden"
  | "rate_limited"
  | "daily_limit"
  | "not_configured"
  | "provider_auth"
  | "provider_busy"
  | "model_unavailable"
  | "blocked"
  | "provider_error"
  | "bad_ai_response"
  | "timeout"
  | "internal";

export interface AnalyzeSuccess {
  ok: true;
  /** 画面から読み取れたポケモン（タイル番号順、最大6匹） */
  data: ExtractedPokemon[];
  /** AIが「読み取れなかった／自信がない」と申告した点（表示用） */
  notes: string[];
  provider: AiProvider;
}

export interface AnalyzeFailure {
  ok: false;
  error: { code: AnalyzeErrorCode; message: string };
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;
