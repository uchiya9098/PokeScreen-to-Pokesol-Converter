/** タイルのタイプ表示（ポケソルの編集画面と同じ色のバッジ） */
const TYPE_STYLE: Record<string, { bg: string; fg: string }> = {
  ノーマル: { bg: "#8f9468", fg: "#ffffff" },
  ほのお: { bg: "#ee8130", fg: "#ffffff" },
  みず: { bg: "#6390f0", fg: "#ffffff" },
  でんき: { bg: "#f7d02c", fg: "#1f2937" },
  くさ: { bg: "#7ac74c", fg: "#ffffff" },
  こおり: { bg: "#96d9d6", fg: "#1f2937" },
  かくとう: { bg: "#c22e28", fg: "#ffffff" },
  どく: { bg: "#a33ea1", fg: "#ffffff" },
  じめん: { bg: "#e2bf65", fg: "#1f2937" },
  ひこう: { bg: "#a98ff3", fg: "#ffffff" },
  エスパー: { bg: "#f95587", fg: "#ffffff" },
  むし: { bg: "#a6b91a", fg: "#ffffff" },
  いわ: { bg: "#b6a136", fg: "#ffffff" },
  ゴースト: { bg: "#735797", fg: "#ffffff" },
  ドラゴン: { bg: "#6f35fc", fg: "#ffffff" },
  あく: { bg: "#705746", fg: "#ffffff" },
  はがね: { bg: "#b7b7ce", fg: "#1f2937" },
  フェアリー: { bg: "#d685ad", fg: "#ffffff" },
};

export default function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLE[type] ?? { bg: "#475569", fg: "#ffffff" };
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {type}
    </span>
  );
}
