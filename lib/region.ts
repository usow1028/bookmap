import { UserLocation } from "@/lib/types";
import { hasNaverMapsCredentials, reverseGeocodeWithNaver } from "@/lib/naver-maps";

const REGION_CODES = [
  { code: "11", names: ["서울", "서울특별시", "seoul"] },
  { code: "21", names: ["부산", "부산광역시", "busan"] },
  { code: "22", names: ["대구", "대구광역시", "daegu"] },
  { code: "23", names: ["인천", "인천광역시", "incheon"] },
  { code: "24", names: ["광주", "광주광역시", "gwangju"] },
  { code: "25", names: ["대전", "대전광역시", "daejeon"] },
  { code: "26", names: ["울산", "울산광역시", "ulsan"] },
  { code: "29", names: ["세종", "세종특별자치시", "sejong"] },
  { code: "31", names: ["경기", "경기도", "gyeonggi"] },
  { code: "32", names: ["강원", "강원도", "강원특별자치도", "gangwon"] },
  { code: "33", names: ["충북", "충청북도", "chungbuk"] },
  { code: "34", names: ["충남", "충청남도", "chungnam"] },
  { code: "35", names: ["전북", "전라북도", "전북특별자치도", "jeonbuk"] },
  { code: "36", names: ["전남", "전라남도", "jeonnam"] },
  { code: "37", names: ["경북", "경상북도", "gyeongbuk"] },
  { code: "38", names: ["경남", "경상남도", "gyeongnam"] },
  { code: "39", names: ["제주", "제주도", "제주특별자치도", "jeju"] },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function matchRegionCode(text: string) {
  const normalized = normalize(text);

  if (!normalized) {
    return null;
  }

  const matched = REGION_CODES.find((region) =>
    region.names.some((name) => {
      const candidate = normalize(name);
      return normalized.includes(candidate) || candidate.includes(normalized);
    }),
  );

  return matched?.code ?? null;
}

async function reverseGeocodeRegion(location: UserLocation) {
  if (hasNaverMapsCredentials()) {
    try {
      const results = await reverseGeocodeWithNaver(location);
      const candidates = results.flatMap((result) => [
        result.region?.area1?.name,
        result.region?.area2?.name,
        result.region?.area3?.name,
      ]);

      for (const candidate of candidates) {
        if (candidate) {
          const regionCode = matchRegionCode(candidate);

          if (regionCode) {
            return regionCode;
          }
        }
      }
    } catch {
      // Ignore NAVER reverse geocoding failures and fall back to the secondary provider.
    }
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(location.lat));
  url.searchParams.set("lon", String(location.lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "8");
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

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    address?: Record<string, string | undefined>;
    display_name?: string;
  };

  const candidates = [
    payload.address?.state,
    payload.address?.province,
    payload.address?.city,
    payload.address?.county,
    payload.display_name,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const regionCode = matchRegionCode(candidate);

    if (regionCode) {
      return regionCode;
    }
  }

  return null;
}

export async function resolveRegionCode(location: UserLocation) {
  const byLabel = matchRegionCode(location.label);

  if (byLabel) {
    return byLabel;
  }

  return reverseGeocodeRegion(location);
}
