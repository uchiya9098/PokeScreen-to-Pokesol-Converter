import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokeScreen to Pokesol Converter",
  description:
    "ゲーム画面のスクリーンショットをAIで解析し、ポケソル用テキストに変換します。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  return (
    <html lang="ja">
      <body className="font-sans antialiased">
        {children}
        {adsenseClient && (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`}
            crossOrigin="anonymous"
          />
        )}
      </body>
    </html>
  );
}
