/**
 * 簡易レート制限（メモリ内）。
 *
 * 注意: Vercel のようなサーバーレス環境ではインスタンスごとにメモリが分かれるため、
 * これは「ベストエフォート」の防御です。本格的に公開してAPI費用を守るなら、
 * Upstash Redis（@upstash/ratelimit）や Vercel WAF のレート制限への置き換えを推奨します。
 * その場合も check() の呼び出し箇所（app/api/analyze/route.ts）だけ差し替えれば済みます。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const ipBuckets = new Map<string, Bucket>();
let daily: Bucket = { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };

export type LimitResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "daily_limit"; retryAfterSec: number };

const toPositiveInt = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function checkRateLimit(
  ip: string,
  env: Record<string, string | undefined>,
  now: number = Date.now(),
): LimitResult {
  const perIp = toPositiveInt(env.RATE_LIMIT_PER_10MIN, 8);
  const dailyMax = toPositiveInt(env.DAILY_LIMIT, 400);

  if (now >= daily.resetAt) daily = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
  if (daily.count >= dailyMax) {
    return {
      ok: false,
      reason: "daily_limit",
      retryAfterSec: Math.ceil((daily.resetAt - now) / 1000),
    };
  }

  // 期限切れエントリの掃除（メモリ肥大の防止）
  if (ipBuckets.size > 5000) {
    for (const [key, b] of ipBuckets) if (now >= b.resetAt) ipBuckets.delete(key);
  }

  const bucket = ipBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    if (bucket.count >= perIp) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
      };
    }
    bucket.count += 1;
  }
  daily.count += 1;
  return { ok: true };
}

/** テスト用 */
export function __resetRateLimit(): void {
  ipBuckets.clear();
  daily = { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
}
