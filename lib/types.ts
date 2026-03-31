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
  kind?: "address" | "place";
  source?:
    | "juso"
    | "naver-geocode"
    | "naver-local"
    | "kakao-local"
    | "osm";
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
  coverUrl?: string;
  detailUrl?: string;
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
  travelTimes: {
    walk: number;
    bike: number;
    car: number;
  };
  hasBook: boolean;
  loanAvailable: boolean;
  availabilityChecked: boolean;
  checkedAt: string;
  score: number;
  routePath?: MapPoint[];
};

export type SearchResponse = {
  query: string;
  books: BookCandidate[];
  resolvedBook: BookCandidate | null;
  location: UserLocation;
  results: SearchResult[];
  warnings: string[];
  source: "live";
};
