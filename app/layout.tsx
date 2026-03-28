import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookmap",
  description: "가까운 공공도서관에서 찾는 책을 빠르게 탐색하는 지도형 검색 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const naverClientId = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;

  return (
    <html lang="ko">
      <body>
        {naverClientId ? (
          <Script
            id="naver-maps-sdk"
            strategy="afterInteractive"
            src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverClientId}`}
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
