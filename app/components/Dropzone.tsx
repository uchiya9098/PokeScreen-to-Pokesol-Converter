"use client";

import { useRef, useState } from "react";

export interface UploadedImage {
  id: string;
  file: File;
  url: string;
}

interface DropzoneProps {
  images: UploadedImage[];
  maxFiles: number;
  /** ドロップ欄の見出しと補足（省略時はチーム画面用の文言） */
  title?: string;
  hint?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}

export default function Dropzone({
  images,
  maxFiles,
  title = "チーム画面の「能力」「ステータス」を2枚まとめてドロップ",
  hint = "またはクリックして選択（PNG / JPG・各20MBまで・片方だけでもOK）",
  disabled = false,
  onFiles,
  onRemove,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = images.length >= maxFiles;

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="スクリーンショットをアップロード"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          onFiles(Array.from(e.dataTransfer.files));
        }}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-ink-faint bg-paper hover:border-accent hover:bg-accent-soft",
          disabled ? "pointer-events-none opacity-50" : "",
        ].join(" ")}
      >
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-sub">{hint}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {images.map((img) => (
            <li key={img.id} className="rounded border border-line bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.file.name}
                className="aspect-video w-full rounded-t object-cover"
              />
              <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5 text-xs">
                <span className="min-w-0 truncate text-ink-sub" title={img.file.name}>
                  {img.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(img.id)}
                  disabled={disabled}
                  aria-label={`${img.file.name} を削除`}
                  className="shrink-0 text-danger underline underline-offset-2 hover:no-underline disabled:opacity-40"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {full && (
        <p className="text-xs text-ink-sub">
          {maxFiles}枚そろいました。差し替える場合は先に画像を削除してください。
        </p>
      )}
    </div>
  );
}
