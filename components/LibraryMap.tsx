"use client";

import dynamic from "next/dynamic";
import { SearchResult, UserLocation } from "@/lib/types";

const LibraryMapClient = dynamic(() => import("@/components/LibraryMapClient"), {
  ssr: false,
  loading: () => <div className="map-shell map-loading">지도를 준비하는 중입니다...</div>,
});

type LibraryMapProps = {
  userLocation?: UserLocation | null;
  results: SearchResult[];
  selectedLibraryId?: string | null;
  onSelectLibrary?: (libraryId: string) => void;
};

export function LibraryMap({
  userLocation,
  results,
  selectedLibraryId,
  onSelectLibrary,
}: LibraryMapProps) {
  if (!userLocation) {
    return <div className="map-shell map-loading">출발 위치를 선택하면 지도와 경로가 표시됩니다.</div>;
  }

  return (
    <LibraryMapClient
      userLocation={userLocation}
      results={results}
      selectedLibraryId={selectedLibraryId}
      onSelectLibrary={onSelectLibrary}
    />
  );
}
