/**
 * アップロード前にブラウザ側で画像を縮小・JPEG化する。
 *  - Vercel のリクエストサイズ上限(約4.5MB)に収めるため
 *  - AIへの送信量（=トークン費用・待ち時間）を減らすため
 * ゲーム画面の文字が読める解像度（長辺1920px）は維持する。
 */

const MAX_LONG_SIDE = 1920;
const TARGET_BYTES = 1.4 * 1024 * 1024;
const QUALITIES = [0.88, 0.8, 0.7, 0.6, 0.5];

function loadImage(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`画像を読み込めませんでした: ${file.name}`));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("画像の変換に失敗しました。"))),
      "image/jpeg",
      quality,
    );
  });
}

export interface CompressOptions {
  maxLongSide?: number;
  targetBytes?: number;
}

/** 1匹ずつの画面を最大6枚まとめて送るときの設定（合計がサーバーの上限4MBに収まるよう、1枚あたり約0.6MB） */
export const SINGLE_SHOT_COMPRESS: CompressOptions = { maxLongSide: 1280, targetBytes: 0.6 * 1024 * 1024 };

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const longSide = opts.maxLongSide ?? MAX_LONG_SIDE;
  const targetBytes = opts.targetBytes ?? TARGET_BYTES;
  const { img, release } = await loadImage(file);
  try {
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error(`画像のサイズを取得できませんでした: ${file.name}`);

    const scale = Math.min(1, longSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas を初期化できませんでした。");
    // 透過PNG対策: 白背景に描画してからJPEG化
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    let blob = await toBlob(canvas, QUALITIES[0]);
    for (let i = 1; i < QUALITIES.length && blob.size > targetBytes; i++) {
      blob = await toBlob(canvas, QUALITIES[i]);
    }
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    release();
  }
}
