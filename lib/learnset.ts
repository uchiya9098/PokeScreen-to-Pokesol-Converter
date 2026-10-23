import { LEARNSETS } from "./data/learnsets";

const cache = new Map<string, readonly string[]>();

/** 種族データの名前（DEXのキー。性別で分かれるものは「イダイトウ♂」）から、覚える技の一覧を返す。無ければ undefined */
export function learnsetFor(key: string): readonly string[] | undefined {
  const raw = LEARNSETS[key];
  if (raw === undefined) return undefined;
  let list = cache.get(key);
  if (!list) {
    list = raw.split(",");
    cache.set(key, list);
  }
  return list;
}
