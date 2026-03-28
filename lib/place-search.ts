import { LocationSuggestion, MapPoint } from "@/lib/types";

type NaverLocalItem = {
  title?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
};

type KakaoLocalDocument = {
  place_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
}

function readNaverSearchClientId() {
  return process.env.NAVER_SEARCH_CLIENT_ID?.trim() ?? "";
}

function readNaverSearchClientSecret() {
  return process.env.NAVER_SEARCH_CLIENT_SECRET?.trim() ?? "";
}

function readKakaoRestApiKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? "";
}

export function hasNaverLocalSearchCredentials() {
  return Boolean(readNaverSearchClientId() && readNaverSearchClientSecret());
}

export function hasKakaoLocalSearchKey() {
  return Boolean(readKakaoRestApiKey());
}

function buildNaverLocalHeaders() {
  const clientId = readNaverSearchClientId();
  const clientSecret = readNaverSearchClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("NAVER local search credentials are missing");
  }

  return {
    accept: "application/json",
    "x-naver-client-id": clientId,
    "x-naver-client-secret": clientSecret,
  };
}

function buildKakaoHeaders() {
  const apiKey = readKakaoRestApiKey();

  if (!apiKey) {
    throw new Error("Kakao local search key is missing");
  }

  return {
    Authorization: `KakaoAK ${apiKey}`,
  };
}

function parseNaverCoordinate(value: string | undefined) {
  const raw = Number(value);

  if (!Number.isFinite(raw)) {
    return null;
  }

  if (Math.abs(raw) > 1000) {
    return raw / 10000000;
  }

  return raw;
}

function buildNaverLocalSuggestion(item: NaverLocalItem): LocationSuggestion | null {
  const parsedLat = parseNaverCoordinate(item.mapy);
  const parsedLng = parseNaverCoordinate(item.mapx);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }

  const lat = parsedLat as number;
  const lng = parsedLng as number;

  const label = stripHtml(item.title ?? "");

  if (!label) {
    return null;
  }

  const detailParts = [
    item.category?.trim(),
    item.roadAddress?.trim() || item.address?.trim() || "",
  ].filter(Boolean);

  return {
    label,
    detail: detailParts.join(" · ") || undefined,
    lat,
    lng,
    kind: "place",
    source: "naver-local",
  };
}

function buildKakaoSuggestion(item: KakaoLocalDocument): LocationSuggestion | null {
  const lat = Number(item.y);
  const lng = Number(item.x);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const label = item.place_name?.trim() ?? "";

  if (!label) {
    return null;
  }

  const detailParts = [
    item.category_name?.trim(),
    item.road_address_name?.trim() || item.address_name?.trim() || "",
  ].filter(Boolean);

  return {
    label,
    detail: detailParts.join(" · ") || undefined,
    lat,
    lng,
    kind: "place",
    source: "kakao-local",
  };
}

export async function searchPlacesWithNaverLocal(query: string, limit = 5) {
  if (!hasNaverLocalSearchCredentials()) {
    return [] as LocationSuggestion[];
  }

  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", query.trim());
  url.searchParams.set("display", String(Math.min(Math.max(limit, 1), 5)));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "random");

  const response = await fetch(url, {
    headers: buildNaverLocalHeaders(),
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    throw new Error(`NAVER local search failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    items?: NaverLocalItem[];
  };

  return (payload.items ?? [])
    .map((item) => buildNaverLocalSuggestion(item))
    .filter((suggestion): suggestion is LocationSuggestion => Boolean(suggestion));
}

export async function searchPlacesWithKakaoLocal(
  query: string,
  limit = 5,
  origin?: MapPoint,
) {
  if (!hasKakaoLocalSearchKey()) {
    return [] as LocationSuggestion[];
  }

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query.trim());
  url.searchParams.set("size", String(Math.min(Math.max(limit, 1), 15)));

  if (origin) {
    url.searchParams.set("x", String(origin.lng));
    url.searchParams.set("y", String(origin.lat));
    url.searchParams.set("radius", "20000");
    url.searchParams.set("sort", "distance");
  }

  const response = await fetch(url, {
    headers: buildKakaoHeaders(),
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    throw new Error(`Kakao local search failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    documents?: KakaoLocalDocument[];
  };

  return (payload.documents ?? [])
    .map((item) => buildKakaoSuggestion(item))
    .filter((suggestion): suggestion is LocationSuggestion => Boolean(suggestion))
    .slice(0, limit);
}
