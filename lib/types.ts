export type UserLocation = {
  label: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
};

export type LocationSuggestion = {
  label: string;
  detail?: string;
  lat: number;
  lng: number;
};

export type MapPoint = {
  lat: number;
  lng: number;
};

export type BookCandidate = {
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  synopsis: string;
  tags: string[];
};

export type LibraryHolding = {
  libraryId: string;
  hasBook: boolean;
  loanAvailable: boolean;
  checkedAt: string;
};

export type LibraryRecord = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  homepage: string;
  openHours: string;
  district: string;
};

export type SearchResult = {
  library: LibraryRecord;
  distanceKm: number;
  etaMinutes: number;
  hasBook: boolean;
  loanAvailable: boolean;
  checkedAt: string;
  score: number;
  routePath?: MapPoint[];
};

export type SearchResponse = {
  query: string;
  resolvedBook: BookCandidate | null;
  location: UserLocation;
  results: SearchResult[];
  warnings: string[];
  source: "live" | "mock";
};
