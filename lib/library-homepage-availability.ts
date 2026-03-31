import type { AvailabilitySource, AvailabilityStatus, BookCandidate, LibraryRecord } from "@/lib/types";

type HomepageAvailability = {
  hasBook: boolean;
  loanAvailable: boolean;
  reservationAvailable: boolean;
  availabilityChecked: boolean;
  availabilityStatus: AvailabilityStatus;
  availabilitySource: AvailabilitySource;
  availabilityDetail: string;
  checkedAt: string;
};

type PyxisConfig = {
  apiUrl: string;
  homePageId: string;
  collectionId: string;
};

type PyxisBranchVolume = {
  id?: number;
  name?: string;
  cState?: string;
  cStateCode?: string;
  hasItem?: boolean;
};

type PyxisSearchBiblio = {
  id?: number;
  isbn?: string;
  branchVolumes?: PyxisBranchVolume[] | null;
};

type PyxisSearchResponse = {
  data?: {
    list?: PyxisSearchBiblio[] | null;
  } | null;
};

type PyxisIsxnBiblio = {
  id?: number;
};

type PyxisIsxnResponse = {
  data?: {
    list?: PyxisIsxnBiblio[] | null;
  } | null;
};

type PyxisBranchesResponse = {
  data?: {
    list?: PyxisBranch[] | null;
  } | null;
};

type PyxisBranch = {
  id?: number;
  name?: string;
  libraryCode?: string;
};

type PyxisCirculationState = {
  code?: string;
  name?: string;
  isCharged?: boolean;
};

type PyxisItemState = {
  code?: string;
  name?: string;
};

type PyxisBiblioItem = {
  barcode?: string;
  branch?: PyxisBranch | null;
  circulationState?: PyxisCirculationState | null;
  itemState?: PyxisItemState | null;
  availableServices?: string[] | null;
  holdCount?: number | null;
  dueDate?: string | null;
};

type PyxisItemsResponse = {
  data?: {
    list?: PyxisBiblioItem[] | null;
  } | null;
};

type PyxisBiblioDetailPrimaryEntry = {
  titleStatement?: string;
  isbn?: string | null;
  content?: string | null;
};

type PyxisBiblioDetailResponse = {
  data?: {
    list?: PyxisBiblioDetailPrimaryEntry[] | null;
  } | null;
};

type MatchedPyxisBranch = {
  biblioId: number;
  branchId: number;
  branchName: string;
  searchState: string;
  searchStateCode: string;
};

type PyxisExactBiblioIndex = {
  hasRecords: boolean;
  allBiblioIds: number[];
  byLibraryCode: Map<string, number[]>;
};

const pyxisConfigCache = new Map<string, Promise<PyxisConfig | null>>();
const pyxisBranchesCache = new Map<string, Promise<PyxisBranch[]>>();
const pyxisExactBiblioIndexCache = new Map<string, Promise<PyxisExactBiblioIndex>>();

function normalizeHomepageUrl(homepage: string) {
  const trimmed = homepage.trim();

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizeLibraryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[()[\]{}'"`.,:;!?/\\|_-]+/g, "")
    .replace(/\s+/g, "");
}

function isMatchingLibraryName(targetName: string, candidateName: string) {
  const normalizedTarget = normalizeLibraryName(targetName);
  const normalizedCandidate = normalizeLibraryName(candidateName);

  if (!normalizedTarget || !normalizedCandidate) {
    return false;
  }

  return (
    normalizedTarget === normalizedCandidate
    || normalizedTarget.includes(normalizedCandidate)
    || normalizedCandidate.includes(normalizedTarget)
  );
}

function buildHomepageCheckedAtLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

function formatDueDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return matched ? `${matched[1]}.${matched[2]}.${matched[3]}` : value;
}

async function fetchText(url: string | URL) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/javascript,text/javascript,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string | URL) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JSON: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function collectScriptUrls(html: string, baseUrl: URL) {
  const matches = html.matchAll(/<script\b[^>]*\bsrc=(["'])([^"']+)\1/gi);
  const urls = new Set<string>();

  for (const match of matches) {
    const src = match[2]?.trim();

    if (!src) {
      continue;
    }

    try {
      urls.add(new URL(src, baseUrl).toString());
    } catch {
      // Ignore malformed script URLs and continue with the next candidate.
    }
  }

  return Array.from(urls).sort((left, right) => {
    const leftPriority = /main\.js(?:$|\?)/i.test(left) ? 0 : 1;
    const rightPriority = /main\.js(?:$|\?)/i.test(right) ? 0 : 1;
    return leftPriority - rightPriority;
  });
}

function extractPyxisConfig(scriptSource: string): PyxisConfig | null {
  const apiUrlMatch = scriptSource.match(/API_URL:"([^"]+)"/);
  const homePageIdMatch = scriptSource.match(/HOME_PAGE_ID:(\d+)/);
  const collectionIdMatch = scriptSource.match(/SEARCH_COLLECTION_DEFAULT:(\d+)/);

  if (!apiUrlMatch?.[1] || !homePageIdMatch?.[1] || !collectionIdMatch?.[1]) {
    return null;
  }

  return {
    apiUrl: apiUrlMatch[1],
    homePageId: homePageIdMatch[1],
    collectionId: collectionIdMatch[1],
  };
}

async function resolvePyxisConfig(homepage: string) {
  const normalizedHomepage = normalizeHomepageUrl(homepage);

  if (!normalizedHomepage) {
    return null;
  }

  const cached = pyxisConfigCache.get(normalizedHomepage);

  if (cached) {
    try {
      return await cached;
    } catch {
      pyxisConfigCache.delete(normalizedHomepage);
      return null;
    }
  }

  const configPromise = (async () => {
    const homepageUrl = new URL(normalizedHomepage);
    const homepageHtml = await fetchText(homepageUrl);
    const scriptUrls = collectScriptUrls(homepageHtml, homepageUrl);

    for (const scriptUrl of scriptUrls) {
      if (!/\.js(?:$|\?)/i.test(scriptUrl)) {
        continue;
      }

      try {
        const scriptSource = await fetchText(scriptUrl);
        const config = extractPyxisConfig(scriptSource);

        if (config) {
          return config;
        }
      } catch {
        // Ignore bundle fetch failures and keep scanning the remaining scripts.
      }
    }

    return null;
  })();

  pyxisConfigCache.set(normalizedHomepage, configPromise);

  try {
    return await configPromise;
  } catch {
    pyxisConfigCache.delete(normalizedHomepage);
    return null;
  }
}

function buildPyxisSearchUrl(config: PyxisConfig, searchTerm: string) {
  const url = new URL(
    `${config.homePageId}/collections/${config.collectionId}/search`,
    config.apiUrl,
  );

  url.searchParams.set("all", `1|k|a|${searchTerm}`);
  url.searchParams.set("facet", "false");
  url.searchParams.set("max", "100");
  return url;
}

function buildPyxisIsxnUrl(config: PyxisConfig, isbn13: string) {
  const url = new URL(`${config.homePageId}/biblio-by-isxn`, config.apiUrl);
  url.searchParams.set("isbn", isbn13);
  return url;
}

function buildPyxisBranchesUrl(config: PyxisConfig) {
  return new URL(`${config.homePageId}/branches`, config.apiUrl);
}

function buildPyxisBiblioDetailUrl(config: PyxisConfig, biblioId: number) {
  return new URL(`${config.homePageId}/biblios/${biblioId}`, config.apiUrl);
}

function buildPyxisItemsUrl(config: PyxisConfig, biblioId: number, branchId: number) {
  const url = new URL(`${config.homePageId}/biblios/${biblioId}/items`, config.apiUrl);
  url.searchParams.set("branchId", String(branchId));
  return url;
}

function dedupeMatchedBranches(matches: MatchedPyxisBranch[]) {
  const deduped = new Map<string, MatchedPyxisBranch>();

  for (const match of matches) {
    deduped.set(`${match.biblioId}:${match.branchId}`, match);
  }

  return Array.from(deduped.values());
}

function collectMatchedPyxisBranches(
  library: LibraryRecord,
  isbn13: string,
  searchBiblios: PyxisSearchBiblio[],
) {
  const matches: MatchedPyxisBranch[] = [];

  for (const biblio of searchBiblios) {
    if (!biblio.id || biblio.isbn?.trim() !== isbn13) {
      continue;
    }

    for (const branchVolume of biblio.branchVolumes ?? []) {
      if (!branchVolume.id || !branchVolume.name) {
        continue;
      }

      if (!isMatchingLibraryName(library.name, branchVolume.name)) {
        continue;
      }

      matches.push({
        biblioId: biblio.id,
        branchId: branchVolume.id,
        branchName: branchVolume.name,
        searchState: branchVolume.cState?.trim() ?? "",
        searchStateCode: branchVolume.cStateCode?.trim() ?? "",
      });
    }
  }

  return dedupeMatchedBranches(matches);
}

function mergePyxisSearchBiblios(groups: PyxisSearchBiblio[][]) {
  const merged = new Map<number, PyxisSearchBiblio>();

  for (const group of groups) {
    for (const biblio of group) {
      if (!biblio.id) {
        continue;
      }

      merged.set(biblio.id, biblio);
    }
  }

  return Array.from(merged.values());
}

async function fetchPyxisSearchBiblios(config: PyxisConfig, searchTerm: string) {
  const payload = await fetchJson<PyxisSearchResponse>(buildPyxisSearchUrl(config, searchTerm));
  return payload.data?.list ?? [];
}

async function fetchPyxisIsxnBiblios(config: PyxisConfig, isbn13: string) {
  const payload = await fetchJson<PyxisIsxnResponse>(buildPyxisIsxnUrl(config, isbn13));
  return payload.data?.list ?? [];
}

async function fetchPyxisBranches(config: PyxisConfig) {
  const payload = await fetchJson<PyxisBranchesResponse>(buildPyxisBranchesUrl(config));
  return payload.data?.list ?? [];
}

async function fetchPyxisBiblioDetail(config: PyxisConfig, biblioId: number) {
  const payload = await fetchJson<PyxisBiblioDetailResponse>(buildPyxisBiblioDetailUrl(config, biblioId));
  return payload.data?.list?.[0] ?? null;
}

async function fetchPyxisItems(config: PyxisConfig, match: MatchedPyxisBranch) {
  const payload = await fetchJson<PyxisItemsResponse>(
    buildPyxisItemsUrl(config, match.biblioId, match.branchId),
  );
  return payload.data?.list ?? [];
}

function parsePyxisMarcLibraryCode(content: string | null | undefined) {
  if (!content) {
    return "";
  }

  try {
    const parsed = JSON.parse(content) as { fields?: unknown[] };
    const fields = Array.isArray(parsed.fields) ? parsed.fields : [];

    for (const field of fields) {
      if (!Array.isArray(field) || field[0] !== "040" || !Array.isArray(field[3])) {
        continue;
      }

      for (const subfield of field[3]) {
        if (!Array.isArray(subfield)) {
          continue;
        }

        const [code, value] = subfield;

        if ((code === "a" || code === "c") && typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  } catch {
    const matched = content.match(/\["040","[^"]*","[^"]*",\[\["[ac]","(\d{6})"/);
    return matched?.[1] ?? "";
  }

  return "";
}

function buildPyxisCacheKey(config: PyxisConfig) {
  return `${config.apiUrl}|${config.homePageId}|${config.collectionId}`;
}

async function resolvePyxisBranches(config: PyxisConfig) {
  const cacheKey = `${buildPyxisCacheKey(config)}|branches`;
  const cached = pyxisBranchesCache.get(cacheKey);

  if (cached) {
    try {
      return await cached;
    } catch {
      pyxisBranchesCache.delete(cacheKey);
      return [];
    }
  }

  const branchesPromise = fetchPyxisBranches(config);
  pyxisBranchesCache.set(cacheKey, branchesPromise);

  try {
    return await branchesPromise;
  } catch {
    pyxisBranchesCache.delete(cacheKey);
    return [];
  }
}

async function resolvePyxisExactBiblioIndex(config: PyxisConfig, isbn13: string) {
  const cacheKey = `${buildPyxisCacheKey(config)}|isbn:${isbn13}`;
  const cached = pyxisExactBiblioIndexCache.get(cacheKey);

  if (cached) {
    try {
      return await cached;
    } catch {
      pyxisExactBiblioIndexCache.delete(cacheKey);
      throw new Error("Failed to resolve cached Pyxis ISBN index");
    }
  }

  const indexPromise = (async () => {
    const biblios = await fetchPyxisIsxnBiblios(config, isbn13);
    const exactBiblioIds = biblios.map((biblio) => biblio.id).filter((id): id is number => Boolean(id));
    const byLibraryCode = new Map<string, number[]>();

    await Promise.allSettled(
      exactBiblioIds.map(async (biblioId) => {
        const detail = await fetchPyxisBiblioDetail(config, biblioId);
        const libraryCode = parsePyxisMarcLibraryCode(detail?.content);

        if (!libraryCode) {
          return;
        }

        const ids = byLibraryCode.get(libraryCode) ?? [];
        ids.push(biblioId);
        byLibraryCode.set(libraryCode, ids);
      }),
    );

    return {
      hasRecords: exactBiblioIds.length > 0,
      allBiblioIds: exactBiblioIds,
      byLibraryCode,
    } satisfies PyxisExactBiblioIndex;
  })();

  pyxisExactBiblioIndexCache.set(cacheKey, indexPromise);

  try {
    return await indexPromise;
  } catch {
    pyxisExactBiblioIndexCache.delete(cacheKey);
    throw new Error("Failed to build Pyxis ISBN index");
  }
}

function collectMatchingPyxisBranches(library: LibraryRecord, branches: PyxisBranch[]) {
  return branches.filter(
    (branch): branch is PyxisBranch & { id: number; name: string } =>
      Boolean(branch.id)
      && Boolean(branch.name?.trim())
      && isMatchingLibraryName(library.name, branch.name?.trim() ?? ""),
  );
}

async function fetchPyxisItemsForBranches(
  config: PyxisConfig,
  biblioIds: number[],
  branches: Array<PyxisBranch & { id: number; name: string }>,
) {
  const matchedItems: PyxisBiblioItem[] = [];

  for (const biblioId of biblioIds) {
    for (const branch of branches) {
      const items = await fetchPyxisItems(config, {
        biblioId,
        branchId: branch.id,
        branchName: branch.name,
        searchState: "",
        searchStateCode: "",
      }).catch(() => []);

      if (items.length > 0) {
        matchedItems.push(...items);
      }
    }

    if (matchedItems.length > 0) {
      break;
    }
  }

  return matchedItems;
}

function summarizePyxisCatalogMiss(
  library: LibraryRecord,
  reason = `${library.name} 분관 레코드를 홈페이지 검색에서 찾지 못했습니다.`,
): HomepageAvailability {
  return {
    hasBook: true,
    loanAvailable: false,
    reservationAvailable: false,
    availabilityChecked: false,
    availabilityStatus: "unknown",
    availabilitySource: "homepage",
    availabilityDetail: reason,
    checkedAt: buildHomepageCheckedAtLabel(),
  };
}

function summarizePyxisSearchOnly(matches: MatchedPyxisBranch[]): HomepageAvailability | null {
  if (matches.length === 0) {
    return null;
  }

  const stateLabels = Array.from(new Set(matches.map((match) => match.searchState).filter(Boolean)));
  const ready = matches.some((match) => match.searchStateCode === "READY");
  const availabilityStatus: AvailabilityStatus = ready ? "available" : "unavailable";

  return {
    hasBook: true,
    loanAvailable: ready,
    reservationAvailable: false,
    availabilityChecked: true,
    availabilityStatus,
    availabilitySource: "homepage",
    availabilityDetail: stateLabels.join(", "),
    checkedAt: buildHomepageCheckedAtLabel(),
  };
}

function summarizePyxisItems(items: PyxisBiblioItem[]): HomepageAvailability | null {
  if (items.length === 0) {
    return null;
  }

  const ready = items.some((item) => item.circulationState?.code === "READY");
  const reservationAvailable = !ready
    && items.some((item) =>
      (item.availableServices ?? []).some((service) => service === "HOLD" || service === "RESERVATION"),
    );
  const availabilityStatus: AvailabilityStatus = ready
    ? "available"
    : reservationAvailable
      ? "reservation-only"
      : "unavailable";
  const stateLabels = Array.from(
    new Set(
      items
        .map((item) => item.circulationState?.name?.trim() || item.itemState?.name?.trim() || "")
        .filter(Boolean),
    ),
  );
  const dueDates = Array.from(new Set(items.map((item) => formatDueDate(item.dueDate)).filter(Boolean)));
  const holdCount = items.reduce((sum, item) => sum + (Number(item.holdCount) || 0), 0);
  const details = [...stateLabels];

  if (holdCount > 0) {
    details.push(`예약 ${holdCount}명`);
  }

  if (dueDates.length === 1) {
    details.push(`반납예정 ${dueDates[0]}`);
  }

  return {
    hasBook: true,
    loanAvailable: ready,
    reservationAvailable,
    availabilityChecked: true,
    availabilityStatus,
    availabilitySource: "homepage",
    availabilityDetail: details.join(" · "),
    checkedAt: buildHomepageCheckedAtLabel(),
  };
}

export async function resolveHomepageAvailability(
  library: LibraryRecord,
  book: BookCandidate,
): Promise<HomepageAvailability | null> {
  if (!library.homepage.trim() || !book.isbn13.trim()) {
    return null;
  }

  const config = await resolvePyxisConfig(library.homepage);

  if (!config) {
    return null;
  }

  const branches = await resolvePyxisBranches(config).catch(() => []);
  const matchingBranches = collectMatchingPyxisBranches(library, branches);
  const exactBiblioIndex = await resolvePyxisExactBiblioIndex(config, book.isbn13.trim()).catch(() => null);

  if (matchingBranches.length > 0 && exactBiblioIndex?.hasRecords) {
    const exactBiblioIds = exactBiblioIndex.byLibraryCode.get(library.id) ?? [];
    const exactItems = await fetchPyxisItemsForBranches(config, exactBiblioIds, matchingBranches);

    if (exactItems.length > 0) {
      return summarizePyxisItems(exactItems);
    }

    if (exactBiblioIds.length === 0) {
      const branchScopedExactItems = await fetchPyxisItemsForBranches(
        config,
        exactBiblioIndex.allBiblioIds,
        matchingBranches,
      );

      if (branchScopedExactItems.length > 0) {
        return summarizePyxisItems(branchScopedExactItems);
      }

      return summarizePyxisCatalogMiss(
        library,
        `${library.name} exact ISBN 레코드를 홈페이지에서 찾지 못했습니다.`,
      );
    }
  }

  const searchTerms = Array.from(new Set([book.isbn13.trim(), book.title.trim()].filter(Boolean)));
  const searchBiblios = mergePyxisSearchBiblios(
    await Promise.all(searchTerms.map((searchTerm) => fetchPyxisSearchBiblios(config, searchTerm))),
  );
  const matchedBranches = collectMatchedPyxisBranches(library, book.isbn13, searchBiblios);

  if (matchedBranches.length === 0) {
    return branches.some((branch) => isMatchingLibraryName(library.name, branch.name?.trim() ?? ""))
      ? summarizePyxisCatalogMiss(library)
      : null;
  }

  const itemGroups = await Promise.all(
    matchedBranches.map((match) => fetchPyxisItems(config, match).catch(() => [])),
  );
  const matchedItems = itemGroups
    .flat()
    .filter((item) => isMatchingLibraryName(library.name, item.branch?.name?.trim() ?? ""));

  return summarizePyxisItems(matchedItems) ?? summarizePyxisSearchOnly(matchedBranches);
}
