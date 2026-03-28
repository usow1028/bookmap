import { JusoAddressRecord, hasJusoApiKey, searchJusoAddresses } from "@/lib/juso";
import { defaultLocation, sampleLocations } from "@/lib/mock-data";
import {
  geocodeSuggestionsWithNaver,
  geocodeWithNaver,
  hasNaverMapsCredentials,
  reverseGeocodeWithNaver,
} from "@/lib/naver-maps";
import { searchPlacesWithKakaoLocal, searchPlacesWithNaverLocal } from "@/lib/place-search";
import { LocationSuggestion, MapPoint, UserLocation } from "@/lib/types";
import { getDistanceKm } from "@/lib/geo";

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/apt/gi, "아파트")
    .replace(/아파트단지/gi, "아파트")
    .replace(/[()'"`.,_-]/g, "")
    .replace(/\s+/g, "");
}

function queryLooksLikeAddress(query: string) {
  return /(\d|로|길|번길|번지|동|읍|면|리|호)/.test(query);
}

function queryLooksLikePlace(query: string) {
  return /(아파트|빌딩|타워|센터|병원|약국|카페|식당|마트|학교|공원|점|역|은행|시장|도서관)/.test(query);
}

function buildQueryVariants(query: string) {
  const trimmed = query.trim();
  const compact = trimmed.replace(/\s+/g, "");
  const roadSpaced = trimmed.replace(/(\d(?:-\d+)?)(로|길)(\d)/g, "$1$2 $3");
  const variants = [trimmed, compact, roadSpaced]
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(variants)).slice(0, 3);
}

function findPresetLocation(label: string) {
  const normalized = normalize(label);

  return sampleLocations.find((location) => {
    const candidate = normalize(location.label);
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
}

function scoreSuggestion(
  suggestion: LocationSuggestion,
  query: string,
  origin?: MapPoint,
) {
  const normalizedQuery = normalize(query);
  const normalizedLabel = normalize(suggestion.label);
  const normalizedDetail = normalize(suggestion.detail ?? "");
  const isAddressQuery = queryLooksLikeAddress(query);
  const isPlaceQuery = queryLooksLikePlace(query) || !isAddressQuery;
  let score = 0;

  if (normalizedLabel === normalizedQuery) {
    score += 130;
  } else if (normalizedLabel.startsWith(normalizedQuery)) {
    score += 95;
  } else if (normalizedLabel.includes(normalizedQuery)) {
    score += 72;
  }

  if (normalizedDetail.includes(normalizedQuery)) {
    score += 28;
  }

  if (suggestion.kind === "address" && isAddressQuery) {
    score += 25;
  }

  if (suggestion.kind === "place" && isPlaceQuery) {
    score += 25;
  }

  const sourceWeight: Record<NonNullable<LocationSuggestion["source"]>, number> = {
    preset: 12,
    juso: 42,
    "naver-geocode": 34,
    "naver-local": 36,
    "kakao-local": 40,
    osm: 10,
  };

  if (suggestion.source) {
    score += sourceWeight[suggestion.source];
  }

  if (origin) {
    const distanceKm = getDistanceKm(origin, suggestion);
    score += Math.max(0, 18 - Math.round(distanceKm * 2.5));
  }

  return score;
}

function dedupeSuggestions(
  suggestions: LocationSuggestion[],
  query: string,
  limit = 5,
  origin?: MapPoint,
) {
  const ranked = suggestions
    .map((suggestion) => ({
      suggestion,
      score: scoreSuggestion(suggestion, query, origin),
    }))
    .sort((left, right) => right.score - left.score);
  const seen = new Set<string>();
  const deduped: LocationSuggestion[] = [];

  for (const { suggestion } of ranked) {
    const key = `${normalize(suggestion.label)}:${suggestion.lat.toFixed(4)}:${suggestion.lng.toFixed(4)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(suggestion);

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

function formatLandNumber(number1?: string, number2?: string) {
  if (!number1) {
    return "";
  }

  return number2 ? `${number1}-${number2}` : number1;
}

type ReverseGeocodeResult = {
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
    addition0?: { type?: string; value?: string };
    addition1?: { type?: string; value?: string };
    addition2?: { type?: string; value?: string };
    addition3?: { type?: string; value?: string };
    addition4?: { type?: string; value?: string };
  };
};

function formatReverseGeocodeLabel(result?: ReverseGeocodeResult) {
  return [
    result?.region?.area1?.name,
    result?.region?.area2?.name,
    result?.region?.area3?.name,
    result?.region?.area4?.name,
    result?.land?.name,
    formatLandNumber(result?.land?.number1, result?.land?.number2),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function formatRoadAddressLabel(result?: ReverseGeocodeResult) {
  return [
    result?.region?.area1?.name,
    result?.region?.area2?.name,
    result?.land?.name,
    formatLandNumber(result?.land?.number1, result?.land?.number2),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function formatParcelAddressLabel(result?: ReverseGeocodeResult) {
  return formatReverseGeocodeLabel(result);
}

function getAdditionValue(result: ReverseGeocodeResult | undefined, type: string) {
  const additions = [
    result?.land?.addition0,
    result?.land?.addition1,
    result?.land?.addition2,
    result?.land?.addition3,
    result?.land?.addition4,
  ];

  return additions.find((addition) => addition?.type === type)?.value?.trim() ?? "";
}

function buildJusoDetail(record: JusoAddressRecord) {
  const buildingName = record.bdNm?.trim() || record.detBdNmList?.trim() || "";
  const parcel = record.jibunAddr?.trim() ? `지번 ${record.jibunAddr.trim()}` : "";
  const district = record.emdNm?.trim() ? `읍면동 ${record.emdNm.trim()}` : "";
  const postal = record.zipNo?.trim() ? `우편번호 ${record.zipNo.trim()}` : "";

  return [buildingName, parcel, district, postal].filter(Boolean).join(" · ") || undefined;
}

async function geocodeJusoCandidate(record: JusoAddressRecord): Promise<LocationSuggestion | null> {
  if (!hasNaverMapsCredentials()) {
    return null;
  }

  const primaryLabel = record.roadAddrPart1?.trim() || record.roadAddr?.trim() || record.jibunAddr?.trim() || "";

  if (!primaryLabel) {
    return null;
  }

  const candidate = await geocodeWithNaver(primaryLabel);

  if (!candidate) {
    return null;
  }

  return {
    label: primaryLabel,
    detail: buildJusoDetail(record),
    lat: candidate.lat,
    lng: candidate.lng,
    kind: "address",
    source: "juso",
  };
}

function buildNominatimSuggestion(payload: {
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
}): LocationSuggestion | null {
  const lat = Number(payload.lat);
  const lng = Number(payload.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const label = payload.name?.trim() || payload.display_name?.trim() || "";
  const detail =
    payload.name?.trim() && payload.display_name?.trim() && payload.name.trim() !== payload.display_name.trim()
      ? payload.display_name.trim()
      : undefined;

  if (!label) {
    return null;
  }

  return {
    label,
    detail,
    lat,
    lng,
    kind: queryLooksLikeAddress(label) ? "address" : "place",
    source: "osm",
  };
}

async function searchNaverGeocodeSuggestions(query: string, limit: number) {
  if (!hasNaverMapsCredentials()) {
    return [] as LocationSuggestion[];
  }

  const suggestions = await geocodeSuggestionsWithNaver(query, limit);

  return suggestions.map((suggestion) => ({
    ...suggestion,
    kind: "address" as const,
    source: "naver-geocode" as const,
  }));
}

async function searchNominatimSuggestions(query: string, limit: number) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "accept-language": "ko,en",
      "user-agent": "bookmap-prototype/0.1",
    },
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    return [] as LocationSuggestion[];
  }

  const payload = (await response.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
    name?: string;
  }>;

  return payload
    .map((candidate) => buildNominatimSuggestion(candidate))
    .filter((candidate): candidate is LocationSuggestion => Boolean(candidate));
}

async function collectLocationSuggestions(query: string, limit: number, origin?: MapPoint) {
  const variants = buildQueryVariants(query);
  const presetSuggestions = sampleLocations
    .filter((location) => {
      const candidate = normalize(location.label);
      const search = normalize(query);
      return candidate.includes(search) || search.includes(candidate);
    })
    .map((location) => ({
      label: location.label,
      lat: location.lat,
      lng: location.lng,
      kind: "preset" as const,
      source: "preset" as const,
    }));

  const tasks: Array<Promise<LocationSuggestion[]>> = [Promise.resolve(presetSuggestions)];

  for (const variant of variants) {
    if (hasJusoApiKey() && hasNaverMapsCredentials()) {
      tasks.push(
        searchJusoAddresses(variant, limit)
          .then((records) => Promise.all(records.map((record) => geocodeJusoCandidate(record))))
          .then((candidates) => candidates.filter((candidate): candidate is LocationSuggestion => Boolean(candidate)))
          .catch(() => [] as LocationSuggestion[]),
      );
    }

    if (hasNaverMapsCredentials()) {
      tasks.push(searchNaverGeocodeSuggestions(variant, limit).catch(() => [] as LocationSuggestion[]));
    }

    tasks.push(searchPlacesWithNaverLocal(variant, limit).catch(() => [] as LocationSuggestion[]));
    tasks.push(searchPlacesWithKakaoLocal(variant, limit, origin).catch(() => [] as LocationSuggestion[]));
  }

  const settled = await Promise.all(tasks);
  const merged = settled.flat();

  if (merged.length > 0) {
    return dedupeSuggestions(merged, query, limit, origin);
  }

  try {
    const fallback = await searchNominatimSuggestions(query, limit);
    return dedupeSuggestions([...presetSuggestions, ...fallback], query, limit, origin);
  } catch {
    return dedupeSuggestions(presetSuggestions, query, limit, origin);
  }
}

export async function suggestLocations(query: string, limit = 5, origin?: MapPoint) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  return collectLocationSuggestions(trimmed, limit, origin);
}

export async function reverseLookupLocationLabel(location: UserLocation) {
  if (hasNaverMapsCredentials()) {
    try {
      const results = (await reverseGeocodeWithNaver(location)) as ReverseGeocodeResult[];
      const roadAddress = results.find((result) => result.name === "roadaddr");
      const parcelAddress = results.find((result) => result.name === "addr");
      const administrativeArea = results.find((result) => result.name === "admcode");
      const legalArea = results.find((result) => result.name === "legalcode");
      const roadLabel = formatRoadAddressLabel(roadAddress);
      const parcelLabel = formatParcelAddressLabel(parcelAddress);
      const administrativeName = administrativeArea?.region?.area3?.name?.trim() ?? "";
      const legalName = legalArea?.region?.area3?.name?.trim() ?? "";
      const buildingName = getAdditionValue(roadAddress, "building");
      const detailParts = [
        buildingName,
        roadLabel && parcelLabel ? `지번 ${parcelLabel}` : "",
        administrativeName && administrativeName !== legalName ? `행정동 ${administrativeName}` : "",
        legalName && legalName !== administrativeName ? `법정동 ${legalName}` : "",
      ].filter(Boolean);
      const label = roadLabel || parcelLabel || formatReverseGeocodeLabel(legalArea || administrativeArea);
      const detail = detailParts.join(" · ");

      if (label) {
        return {
          label,
          detail: detail || undefined,
          lat: location.lat,
          lng: location.lng,
          kind: "address" as const,
          source: "naver-geocode" as const,
        };
      }
    } catch {
      // Ignore NAVER reverse geocoding failures and fall back to the secondary provider.
    }
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(location.lat));
    url.searchParams.set("lon", String(location.lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        "accept-language": "ko,en",
        "user-agent": "bookmap-prototype/0.1",
      },
      next: {
        revalidate: 86400,
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        display_name?: string;
        lat?: string;
        lon?: string;
        name?: string;
      };
      const suggestion = buildNominatimSuggestion({
        ...payload,
        lat: String(location.lat),
        lon: String(location.lng),
      });

      if (suggestion) {
        return suggestion;
      }
    }
  } catch {
    // Ignore reverse geocoding failures and fall back to the coordinates.
  }

  return {
    label: `현재 위치 (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`,
    lat: location.lat,
    lng: location.lng,
    kind: "address" as const,
  };
}

export async function resolveUserLocation(
  location?: Partial<UserLocation>,
): Promise<UserLocation> {
  const label = location?.label?.trim();
  const hasCoordinates =
    typeof location?.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location?.lng === "number" &&
    Number.isFinite(location.lng);

  if (hasCoordinates) {
    if (label === "현재 위치" || !label) {
      try {
        const resolved = await reverseLookupLocationLabel({
          label: "현재 위치",
          lat: location.lat as number,
          lng: location.lng as number,
        });

        return {
          label: resolved.label,
          lat: resolved.lat,
          lng: resolved.lng,
        };
      } catch {
        // Ignore reverse geocoding failures and keep the raw location.
      }
    }

    return {
      label: label || "현재 위치",
      lat: location.lat as number,
      lng: location.lng as number,
    };
  }

  if (!label) {
    return defaultLocation;
  }

  const preset = findPresetLocation(label);

  if (preset) {
    return preset;
  }

  try {
    const [bestCandidate] = await suggestLocations(label, 1, defaultLocation);

    if (bestCandidate) {
      return {
        label: bestCandidate.label,
        lat: bestCandidate.lat,
        lng: bestCandidate.lng,
      };
    }
  } catch {
    // Ignore combined location search failures and fall back to the default center.
  }

  return {
    ...defaultLocation,
    label,
  };
}
