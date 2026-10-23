import { AiError, analyzeImages, resolveProvider, type ImageInput } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import type { AnalyzeErrorCode, AnalyzeMode, AnalyzeResponse } from "@/lib/types";

// Gemini API への fetch と Buffer を使うため Node.js ランタイムで実行
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** チーム画面は「能力」「ステータス」の2枚、1匹ずつの画面は1匹1枚で最大6枚 */
const MAX_IMAGES: Record<AnalyzeMode, number> = { team: 2, single: 6 };
/** Vercel のリクエスト上限(約4.5MB)に収まるよう、クライアントで圧縮した前提の上限値 */
const MAX_BYTES_PER_IMAGE = 2.2 * 1024 * 1024;
const MAX_BYTES_TOTAL = 4 * 1024 * 1024;

function json(body: AnalyzeResponse, status: number, extra?: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extra },
  });
}

function fail(
  code: AnalyzeErrorCode,
  message: string,
  status: number,
  extra?: Record<string, string>,
): Response {
  return json({ ok: false, error: { code, message } }, status, extra);
}

/** マジックナンバーから実際の画像形式を判定（Content-Typeは偽装できるため） */
function sniffMediaType(buf: Uint8Array): ImageInput["mediaType"] | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** 他サイトのページからの呼び出し（API費用の横取り）を弾く簡易チェック */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 同一オリジンの一部リクエストでは付与されない
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (!isSameOrigin(req)) {
      return fail("forbidden", "このリクエストは許可されていません。", 403);
    }

    // 設定不足は先に判定（レート制限の枠を消費しない）
    const cfg = resolveProvider(process.env);

    const limit = checkRateLimit(clientIp(req), process.env);
    if (!limit.ok) {
      const message =
        limit.reason === "daily_limit"
          ? "本日の無料解析の上限に達しました。明日またお試しください（手入力でもご利用いただけます）。"
          : "短時間に解析が集中しています。しばらく待ってからもう一度お試しください。";
      return fail(limit.reason, message, 429, {
        "retry-after": String(limit.retryAfterSec),
      });
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("bad_request", "アップロードされたデータを読み取れませんでした。", 400);
    }

    const mode: AnalyzeMode = form.get("mode") === "single" ? "single" : "team";

    const files = form
      .getAll("images")
      .filter((v): v is File => typeof v !== "string" && v.size > 0);

    if (files.length === 0) {
      return fail(
        "bad_request",
        mode === "single"
          ? "画像が選択されていません。ポケモン1匹ずつの画面のスクリーンショットを、1〜6枚アップロードしてください。"
          : "画像が選択されていません。スクリーンショットを1〜2枚アップロードしてください。",
        400,
      );
    }
    if (files.length > MAX_IMAGES[mode]) {
      return fail("bad_request", `画像は最大${MAX_IMAGES[mode]}枚までです。`, 400);
    }

    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_BYTES_TOTAL || files.some((f) => f.size > MAX_BYTES_PER_IMAGE)) {
      return fail(
        "bad_request",
        "画像のサイズが大きすぎます。解像度を下げるか、別の画像でお試しください。",
        413,
      );
    }

    const images: ImageInput[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mediaType = sniffMediaType(bytes);
      if (!mediaType) {
        return fail(
          "bad_request",
          `「${file.name}」は対応していない画像形式です（JPEG / PNG / WebP のみ）。`,
          415,
        );
      }
      images.push({ mediaType, base64: Buffer.from(bytes).toString("base64") });
    }

    const result = await analyzeImages(images, cfg, fetch, mode);
    return json(
      { ok: true, data: result.data, notes: result.notes, provider: result.provider },
      200,
    );
  } catch (e) {
    if (e instanceof AiError) return fail(e.code, e.message, e.status);
    console.error("[analyze] unexpected error:", e);
    return fail(
      "internal",
      "サーバーで予期しないエラーが発生しました。時間をおいて再度お試しください。",
      500,
    );
  }
}

/** GET などは受け付けない */
export function GET(): Response {
  return fail("bad_request", "POST で画像を送信してください。", 405, { allow: "POST" });
}
