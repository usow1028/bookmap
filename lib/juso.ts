type JusoSearchResponse = {
  results?: {
    common?: {
      errorCode?: string;
      errorMessage?: string;
    };
    juso?: JusoAddressRecord | JusoAddressRecord[];
  };
};

export type JusoAddressRecord = {
  roadAddr?: string;
  roadAddrPart1?: string;
  roadAddrPart2?: string;
  jibunAddr?: string;
  admCd?: string;
  rnMgtSn?: string;
  udrtYn?: string;
  buldMnnm?: string;
  buldSlno?: string;
  bdNm?: string;
  detBdNmList?: string;
  emdNm?: string;
  zipNo?: string;
};

const JUSO_SEARCH_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";

function getJusoApiKey() {
  return (
    process.env.JUSO_API_KEY?.trim() ??
    process.env.JUSO_CONFM_KEY?.trim() ??
    ""
  );
}

export function hasJusoApiKey() {
  return Boolean(getJusoApiKey());
}

function asArray<T>(value: T | T[] | undefined) {
  if (!value) {
    return [] as T[];
  }

  return Array.isArray(value) ? value : [value];
}

export async function searchJusoAddresses(keyword: string, count = 5) {
  const confmKey = getJusoApiKey();

  if (!confmKey) {
    return [];
  }

  const url = new URL(JUSO_SEARCH_URL);
  url.searchParams.set("confmKey", confmKey);
  url.searchParams.set("currentPage", "1");
  url.searchParams.set("countPerPage", String(Math.min(Math.max(count, 1), 10)));
  url.searchParams.set("keyword", keyword.trim());
  url.searchParams.set("resultType", "json");
  url.searchParams.set("firstSort", "road");
  url.searchParams.set("addInfoYn", "Y");
  url.searchParams.set("hstryYn", "N");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    throw new Error(`Juso address search failed: ${response.status}`);
  }

  const payload = (await response.json()) as JusoSearchResponse;
  const common = payload.results?.common;

  if (common?.errorCode && common.errorCode !== "0") {
    throw new Error(common.errorMessage || `Juso address search failed: ${common.errorCode}`);
  }

  return asArray(payload.results?.juso);
}
