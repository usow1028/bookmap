import { JusoAddressRecord, hasJusoApiKey, searchJusoAddresses } from "@/lib/juso";
import { defaultLocation, sampleLocations } from "@/lib/mock-data";
import {
  geocodeSuggestionsWithNaver,
  geocodeWithNaver,
  hasNaverMapsCredentials,
  reverseGeocodeWithNaver,
} from "@/lib/naver-maps";
import { LocationSuggestion, UserLocation } from "@/lib/types";

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function findPresetLocation(label: string) {
  const normalized = normalize(label);

  return sampleLocations.find((location) => {
    const candidate = normalize(location.label);
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
}

function dedupeSuggestions(suggestions: LocationSuggestion[], limit = 5) {
  const seen = new Set<string>();
  const deduped: LocationSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = `${normalize(suggestion.label)}:${suggestion.lat.toFixed(5)}:${suggestion.lng.toFixed(5)}`;

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

  return (
    additions.find((addition) => addition?.type === type)?.value?.trim() ?? ""
  );
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
  };
}

export async function suggestLocations(query: string, limit = 5) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const presetSuggestions = sampleLocations
    .filter((location) => {
      const candidate = normalize(location.label);
      const search = normalize(trimmed);
      return candidate.includes(search) || search.includes(candidate);
    })
    .map((location) => ({
      label: location.label,
      lat: location.lat,
      lng: location.lng,
    }));

  if (hasJusoApiKey() && hasNaverMapsCredentials()) {
    try {
      const jusoCandidates = await searchJusoAddresses(trimmed, limit);
      const jusoSuggestions = (
        await Promise.all(jusoCandidates.map((candidate) => geocodeJusoCandidate(candidate)))
      ).filter((candidate): candidate is LocationSuggestion => Boolean(candidate));

      if (jusoSuggestions.length > 0) {
        return dedupeSuggestions([...presetSuggestions, ...jusoSuggestions], limit);
      }
    } catch {
      // Ignore Juso failures and continue with NAVER or the secondary provider.
    }
  }

  if (hasNaverMapsCredentials()) {
    try {
      const suggestions = await geocodeSuggestionsWithNaver(trimmed, limit);
      return dedupeSuggestions([...presetSuggestions, ...suggestions], limit);
    } catch {
      // Ignore NAVER suggestion failures and fall back to the secondary provider.
    }
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", trimmed);
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

    if (response.ok) {
      const payload = (await response.json()) as Array<{
        display_name?: string;
        lat?: string;
        lon?: string;
        name?: string;
      }>;
      const suggestions = payload
        .map((candidate) => buildNominatimSuggestion(candidate))
        .filter((candidate): candidate is LocationSuggestion => Boolean(candidate));

      return dedupeSuggestions([...presetSuggestions, ...suggestions], limit);
    }
  } catch {
    // Ignore secondary suggestion failures and return the preset matches only.
  }

  return dedupeSuggestions(presetSuggestions, limit);
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

  if (hasJusoApiKey() && hasNaverMapsCredentials()) {
    try {
      const [officialCandidate] = await searchJusoAddresses(label, 1);
      const resolved = officialCandidate ? await geocodeJusoCandidate(officialCandidate) : null;

      if (resolved) {
        return {
          label: resolved.label,
          lat: resolved.lat,
          lng: resolved.lng,
        };
      }
    } catch {
      // Ignore Juso failures and fall back to direct geocoding.
    }
  }

  if (hasNaverMapsCredentials()) {
    try {
      const candidate = await geocodeWithNaver(label);

      if (candidate) {
        return {
          label,
          lat: candidate.lat,
          lng: candidate.lng,
        };
      }
    } catch {
      // Ignore NAVER geocoding failures and fall back to the secondary provider.
    }
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", label);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "kr");

    const response = await fetch(url, {
      headers: {
        "accept-language": "ko,en",
        "user-agent": "bookmap-prototype/0.1",
      },
      next: {
        revalidate: 3600,
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
      }>;
      const candidate = payload[0];
      const lat = Number(candidate?.lat);
      const lng = Number(candidate?.lon);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          label,
          lat,
          lng,
        };
      }
    }
  } catch {
    // Ignore geocoding errors and fall back to the default center.
  }

  return {
    ...defaultLocation,
    label,
  };
}
