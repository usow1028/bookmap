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
  selectedLibraryId?: string | null;
  onSelectLibrary?: (libraryId: string) => void;
};

export function LibraryMap({
  userLocation,
  results,
  selectedLibraryId,
  onSelectLibrary,
}: LibraryMapProps) {
  return (
    <LibraryMapClient
      userLocation={userLocation}
      results={results}
      selectedLibraryId={selectedLibraryId}
      onSelectLibrary={onSelectLibrary}
    />
  );
}
