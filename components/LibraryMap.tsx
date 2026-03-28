"use client";

import dynamic from "next/dynamic";
import { SearchResult, UserLocation } from "@/lib/types";

const LibraryMapClient = dynamic(() => import("@/components/LibraryMapClient"), {
  ssr: false,
  loading: () => <div className="map-shell map-loading">지도를 준비하는 중입니다...</div>,
});

type LibraryMapProps = {
  userLocation: UserLocation;
  results: SearchResult[];
};

export function LibraryMap({ userLocation, results }: LibraryMapProps) {
  return <LibraryMapClient userLocation={userLocation} results={results} />;
}
