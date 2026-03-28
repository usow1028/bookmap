import { LocationSuggestion, MapPoint, UserLocation } from "@/lib/types";

const NAVER_GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const NAVER_REVERSE_GEOCODE_URL = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc";
const NAVER_DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving";

function getKeyId() {
  return process.env.NAVER_MAPS_CLIENT_ID?.trim() ?? "";
}

function getKey() {
  return process.env.NAVER_MAPS_CLIENT_SECRET?.trim() ?? "";
}

export function hasNaverMapsCredentials() {
  return Boolean(getKeyId() && getKey());
}

function getHeaders() {
  const keyId = getKeyId();
  const key = getKey();

  if (!keyId || !key) {
    throw new Error("NAVER maps credentials are missing");
  }

  return {
    accept: "application/json",
    "x-ncp-apigw-api-key-id": keyId,
    "x-ncp-apigw-api-key": key,
  };
}

type NaverGeocodeAddress = {
  x?: string;
  y?: string;
  roadAddress?: string;
  jibunAddress?: string;
  addressElements?: Array<{
    types?: string[];
    longName?: string;
  }>;
};

type NaverGeocodeResponse = {
  status?: string;
  addresses?: NaverGeocodeAddress[];
};

function buildSuggestionFromNaverAddress(address: NaverGeocodeAddress): LocationSuggestion | null {
  const lng = Number(address.x);
  const lat = Number(address.y);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const roadAddress = address.roadAddress?.trim() ?? "";
  const jibunAddress = address.jibunAddress?.trim() ?? "";
  const label = roadAddress || jibunAddress;
  const detail =
    roadAddress && jibunAddress && roadAddress !== jibunAddress ? jibunAddress : undefined;

  if (!label) {
    return null;
  }

  return {
    label,
    detail,
    lat,
    lng,
  };
}

async function requestNaverGeocode(query: string) {
  const url = new URL(NAVER_GEOCODE_URL);
  url.searchParams.set("query", query);

  const response = await fetch(url, {
    headers: getHeaders(),
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    throw new Error(`NAVER geocoding failed: ${response.status}`);
  }

  return (await response.json()) as NaverGeocodeResponse;
}

export async function geocodeSuggestionsWithNaver(query: string, limit = 5) {
  const payload = await requestNaverGeocode(query);

  return (payload.addresses ?? [])
    .map((address) => buildSuggestionFromNaverAddress(address))
    .filter((suggestion): suggestion is LocationSuggestion => Boolean(suggestion))
    .slice(0, limit);
}

export async function geocodeWithNaver(query: string) {
  const payload = await requestNaverGeocode(query);
  const first = payload.addresses?.[0];
  const lng = Number(first?.x);
  const lat = Number(first?.y);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    roadAddress: first?.roadAddress?.trim() ?? "",
    jibunAddress: first?.jibunAddress?.trim() ?? "",
    addressElements: first?.addressElements ?? [],
  };
}

export async function reverseGeocodeWithNaver(location: UserLocation) {
  const url = new URL(NAVER_REVERSE_GEOCODE_URL);
  url.searchParams.set("coords", `${location.lng},${location.lat}`);
  url.searchParams.set("orders", "roadaddr,addr,admcode,legalcode");
  url.searchParams.set("output", "json");

  const response = await fetch(url, {
    headers: getHeaders(),
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    throw new Error(`NAVER reverse geocoding failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      name?: string;
      region?: {
        area1?: { name?: string };
        area2?: { name?: string };
        area3?: { name?: string };
        area4?: { name?: string };
      };
      land?: {
        number1?: string;
        number2?: string;
        name?: string;
      };
    }>;
  };

  return payload.results ?? [];
}

export async function getDrivingRouteSummary(params: {
  start: MapPoint;
  goal: MapPoint;
}) {
  const url = new URL(NAVER_DIRECTIONS_URL);
  url.searchParams.set("start", `${params.start.lng},${params.start.lat}`);
  url.searchParams.set("goal", `${params.goal.lng},${params.goal.lat}`);
  url.searchParams.set("option", "traoptimal");

  const response = await fetch(url, {
    headers: getHeaders(),
    next: {
      revalidate: 900,
    },
  });

  if (!response.ok) {
    throw new Error(`NAVER directions failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    route?: {
      traoptimal?: Array<{
        summary?: {
          distance?: number;
          duration?: number;
        };
        path?: Array<[number, number]>;
      }>;
    };
  };

  const route = payload.route?.traoptimal?.[0];
  const distanceMeters = route?.summary?.distance;
  const durationMs = route?.summary?.duration;

  if (!route || typeof distanceMeters !== "number" || typeof durationMs !== "number") {
    throw new Error("NAVER directions returned no route");
  }

  return {
    distanceKm: distanceMeters / 1000,
    etaMinutes: Math.max(1, Math.round(durationMs / 60000)),
    routePath: (route.path ?? []).map(([lng, lat]) => ({
      lat,
      lng,
    })),
  };
}
