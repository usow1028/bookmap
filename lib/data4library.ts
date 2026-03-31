import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
  estimateCyclingMinutes,
  estimateDrivingMinutes,
  estimateWalkingMinutes,
  getDistanceKm,
} from "@/lib/geo";
import { resolveRegionCode } from "@/lib/region";
import { BookCandidate, LibraryRecord, SearchResponse, SearchResult, UserLocation } from "@/lib/types";

const DATA4LIBRARY_BASE_URL = "https://www.data4library.kr/api";
const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
});

type Data4LibraryErrorKind = "config" | "upstream";

export class Data4LibraryError extends Error {
  kind: Data4LibraryErrorKind;

  constructor(kind: Data4LibraryErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

function getApiKey() {
  const fromEnv =
    process.env.DATA4LIBRARY_API_KEY ?? process.env.BOOKMAP_DATA4LIBRARY_API_KEY ?? "";

  if (fromEnv.trim()) {
    return fromEnv.trim();
  }

  const localKeyPath = join(process.cwd(), "data4libraryapi.md");

  if (!existsSync(localKeyPath)) {
    return "";
  }

  return readFileSync(localKeyPath, "utf8").trim();
}

export function hasData4LibraryKey() {
  return Boolean(getApiKey().trim());
}

function asArray<T>(value: T | T[] | undefined | null) {
  if (!value) {
    return [] as T[];
  }

  return Array.isArray(value) ? value : [value];
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readFirstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readText(source[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function readNumber(value: unknown) {
  const numeric = Number(readText(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function readBoolean(value: unknown) {
  const normalized = readText(value).toLowerCase();

  return normalized === "y" || normalized === "true" || normalized === "1";
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[()[\]{}'"`.,:;!?/\\|_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function tokenizeSearchText(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function countMatchedTokens(source: string, tokens: string[]) {
  if (tokens.length === 0) {
    return 0;
  }

  return tokens.filter((token) => source.includes(token)).length;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstMatch(source: string, pattern: RegExp) {
  const matched = pattern.exec(source);
  return matched?.[1] ? stripHtml(matched[1]) : "";
}

function computeBookCandidateSearchScore(book: BookCandidate, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const queryTokens = tokenizeSearchText(query);

  if (!normalizedQuery) {
    return 0;
  }

  if (/^\d{13}$/.test(compactQuery) && book.isbn13 === compactQuery) {
    return 5000;
  }

  const compactTitle = compactSearchText(book.title);
  const compactAuthor = compactSearchText(book.author);
  const compactPublisher = compactSearchText(book.publisher);
  const compactTags = book.tags.map((tag) => compactSearchText(tag)).join(" ");
  const matchedTitleTokens = countMatchedTokens(compactTitle, queryTokens);
  const matchedAuthorTokens = countMatchedTokens(compactAuthor, queryTokens);
  const matchedPublisherTokens = countMatchedTokens(compactPublisher, queryTokens);
  const matchedTagTokens = countMatchedTokens(compactTags, queryTokens);
  let score = 0;

  if (compactTitle === compactQuery) {
    score = Math.max(score, 4000);
  }

  if (compactTitle.startsWith(compactQuery) && compactQuery.length >= 2) {
    score = Math.max(score, 3600);
  }

  if (compactTitle.includes(compactQuery) && compactQuery.length >= 2) {
    score = Math.max(score, 3200);
  }

  if (queryTokens.length > 1 && matchedTitleTokens === queryTokens.length) {
    score = Math.max(score, 2800 + queryTokens.length * 40);
  } else if (matchedTitleTokens > 0) {
    score = Math.max(score, matchedTitleTokens * 250);
  }

  if (matchedAuthorTokens === queryTokens.length && queryTokens.length > 0) {
    score = Math.max(score, 1700);
  } else if (matchedAuthorTokens > 0) {
    score = Math.max(score, matchedAuthorTokens * 180);
  }

  if (matchedPublisherTokens === queryTokens.length && queryTokens.length > 0) {
    score = Math.max(score, 1100);
  } else if (matchedPublisherTokens > 0) {
    score = Math.max(score, matchedPublisherTokens * 120);
  }

  if (matchedTagTokens === queryTokens.length && queryTokens.length > 0) {
    score = Math.max(score, 900);
  } else if (matchedTagTokens > 0) {
    score = Math.max(score, matchedTagTokens * 80);
  }

  return score;
}

function compareBookCandidates(
  left: { book: BookCandidate; score: number },
  right: { book: BookCandidate; score: number },
) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.book.title.localeCompare(right.book.title, "ko");
}

function rankBookCandidates(candidates: BookCandidate[], query: string, limit: number) {
  const filtered = candidates
    .map((book) => ({
      book,
      score: computeBookCandidateSearchScore(book, query),
    }))
    .filter((entry) => entry.score >= 700)
    .sort(compareBookCandidates)
    .slice(0, limit);

  return filtered.map((entry) => entry.book);
}

function buildSearchQueryVariants(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const collapsed = trimmed.replace(/\s+/g, " ");
  const compact = collapsed.replace(/\s+/g, "");
  const sanitized = collapsed
    .replace(/[()[\]{}'"`.,:;!?/\\|_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(new Set([collapsed, compact, sanitized].filter(Boolean)));
}

async function fetchApiBookCandidates(query: string, pageSize: number) {
  const body = await fetchXml("srchBooks", {
    isbn13: /^\d{13}$/.test(query) ? query : undefined,
    keyword: /^\d{13}$/.test(query) ? undefined : query,
    pageNo: 1,
    pageSize,
    exactMatch: "false",
  });

  const docs = asArray(
    (body.docs as { doc?: Record<string, unknown> | Array<Record<string, unknown>> } | undefined)?.doc,
  );

  return docs
    .map((doc) => mapDocToBookCandidate(doc))
    .filter((candidate): candidate is BookCandidate => Boolean(candidate));
}

async function fetchSiteSearchBookCandidates(query: string, limit: number) {
  const url = new URL("https://www.data4library.kr/srch");
  url.searchParams.set("srchText", query);

  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
    },
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const blocks = html.match(/<div class="list_col">[\s\S]*?<div class="l_c_number">/g) ?? [];

  return blocks
    .map((block) => {
      const isbn13 = extractFirstMatch(block, /<span class="l_c_issn">[\s\S]*?ISBN<\/em>\s*([^<]+)<\/span>/);
      const title = extractFirstMatch(block, /class="l_c_tit">([\s\S]*?)<\/a>/);
      const author = extractFirstMatch(block, /<li><span>지은이<\/span>\s*([\s\S]*?)<\/li>/);
      const publisher = extractFirstMatch(block, /<li><span>출판사<\/span>\s*([\s\S]*?)<\/li>/);
      const detailSeq = extractFirstMatch(block, /onclick="detailBookV\('(\d+)'\)"/);

      if (!isbn13 || !title) {
        return null;
      }

      const candidate: BookCandidate = {
        isbn13,
        title,
        author,
        publisher,
        synopsis: "",
        tags: [],
        detailUrl: detailSeq ? `https://www.data4library.kr/bookV?seq=${detailSeq}` : undefined,
      };

      return candidate;
    })
    .filter((candidate): candidate is BookCandidate => candidate !== null)
    .slice(0, limit);
}

function mergeBookCandidates(...groups: BookCandidate[][]) {
  const merged = new Map<string, BookCandidate>();

  for (const group of groups) {
    for (const candidate of group) {
      const existing = merged.get(candidate.isbn13);

      if (!existing) {
        merged.set(candidate.isbn13, candidate);
        continue;
      }

      merged.set(candidate.isbn13, {
        ...existing,
        ...candidate,
        synopsis: existing.synopsis || candidate.synopsis,
        tags: existing.tags.length > 0 ? existing.tags : candidate.tags,
        coverUrl: existing.coverUrl ?? candidate.coverUrl,
        detailUrl: existing.detailUrl ?? candidate.detailUrl,
      });
    }
  }

  return Array.from(merged.values());
}

function computeScore(params: {
  distanceKm: number;
  etaMinutes: number;
  loanAvailable: boolean;
  hasBook: boolean;
}) {
  const holdingWeight = params.hasBook ? 25 : 0;
  const loanWeight = params.loanAvailable ? 6 : 0;
  const distancePenalty = params.distanceKm * 4.2;
  const etaPenalty = params.etaMinutes * 0.7;

  return Math.round(100 + holdingWeight + loanWeight - distancePenalty - etaPenalty);
}

function compareSearchResults(left: SearchResult, right: SearchResult) {
  if (left.availabilityChecked !== right.availabilityChecked) {
    return left.availabilityChecked ? -1 : 1;
  }

  if (left.hasBook !== right.hasBook) {
    return left.hasBook ? -1 : 1;
  }

  if (left.etaMinutes !== right.etaMinutes) {
    return left.etaMinutes - right.etaMinutes;
  }

  if (left.distanceKm !== right.distanceKm) {
    return left.distanceKm - right.distanceKm;
  }

  return right.score - left.score;
}

function deriveDistrict(address: string) {
  const tokens = address.trim().split(/\s+/);

  return tokens[1] ?? tokens[0] ?? "";
}

function getCheckedAtLabel() {
  const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(previousDay);
}

function buildTravelTimes(distanceKm: number, carMinutes: number) {
  return {
    walk: estimateWalkingMinutes(distanceKm),
    bike: estimateCyclingMinutes(distanceKm),
    car: carMinutes,
  };
}

async function fetchXml(endpoint: string, params: Record<string, string | number | undefined>) {
  const apiKey = getApiKey().trim();

  if (!apiKey) {
    throw new Data4LibraryError("config", "DATA4LIBRARY_API_KEY is missing");
  }

  const url = new URL(`${DATA4LIBRARY_BASE_URL}/${endpoint}`);
  url.searchParams.set("authKey", apiKey);
  url.searchParams.set("format", "xml");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
    next: {
      revalidate: 3600,
    },
  });

  const xml = await response.text();
  const payload = xmlParser.parse(xml) as {
    response?: Record<string, unknown>;
  };

  const body = payload.response;

  if (!body) {
    throw new Data4LibraryError("upstream", "Malformed response");
  }

  const error = readText(body.error);

  if (error) {
    throw new Data4LibraryError("upstream", error);
  }

  return body;
}

function mapDocToBookCandidate(doc: Record<string, unknown>): BookCandidate | null {
  const isbn13 = readText(doc.isbn13);
  const title = readText(doc.bookname);

  if (!isbn13 || !title) {
    return null;
  }

  return {
    isbn13,
    title,
    author: readText(doc.authors),
    publisher: readText(doc.publisher),
    synopsis: "",
    tags: [readText(doc.class_nm)].filter(Boolean),
    coverUrl: readFirstText(doc, ["bookImageURL", "bookImageUrl", "bookimageURL", "bookimageUrl"]) || undefined,
    detailUrl: readFirstText(doc, ["bookDtlUrl", "bookDtlURL", "bookDetailUrl"]) || undefined,
  };
}

async function searchBookCandidates(query: string, limit = 8) {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  if (/^\d{13}$/.test(trimmed)) {
    return fetchApiBookCandidates(trimmed, 1);
  }

  const apiCandidates = mergeBookCandidates(
    ...(
      await Promise.all(
        buildSearchQueryVariants(trimmed).map((variant) => fetchApiBookCandidates(variant, 30).catch(() => [])),
      )
    ),
  );
  const rankedApiCandidates = rankBookCandidates(apiCandidates, trimmed, limit);
  const siteFallbackNeeded =
    rankedApiCandidates.length === 0 || (tokenizeSearchText(trimmed).length > 1 && rankedApiCandidates.length < limit);

  if (!siteFallbackNeeded) {
    return rankedApiCandidates;
  }

  const siteCandidates = await fetchSiteSearchBookCandidates(trimmed, limit * 2).catch(
    (): BookCandidate[] => [],
  );

  return rankBookCandidates(
    mergeBookCandidates(siteCandidates, apiCandidates),
    trimmed,
    limit,
  );
}

async function fetchBookCandidateByIsbn(isbn13: string) {
  const trimmed = isbn13.trim();

  if (!trimmed) {
    return null;
  }

  const body = await fetchXml("srchBooks", {
    isbn13: trimmed,
    pageNo: 1,
    pageSize: 1,
    exactMatch: "true",
  });

  const docs = asArray(
    (body.docs as { doc?: Record<string, unknown> | Array<Record<string, unknown>> } | undefined)?.doc,
  );

  return mapDocToBookCandidate(docs[0] ?? {});
}

async function fetchLibrariesByBook(isbn13: string, regionCode: string) {
  const body = await fetchXml("libSrchByBook", {
    isbn: isbn13,
    region: regionCode,
    pageNo: 1,
    pageSize: 100,
  });

  const libs = asArray(
    (body.libs as { lib?: Record<string, unknown> | Array<Record<string, unknown>> } | undefined)?.lib,
  );

  return libs
    .map((lib) => {
      const lat = readNumber(lib.latitude);
      const lng = readNumber(lib.longitude);

      if (lat === null || lng === null) {
        return null;
      }

      const address = readText(lib.address);

      return {
        id: readText(lib.libCode),
        name: readText(lib.libName),
        address,
        lat,
        lng,
        homepage: readText(lib.homepage),
        openHours: "",
        district: deriveDistrict(address),
      } satisfies LibraryRecord;
    })
    .filter((library): library is LibraryRecord => library !== null);
}

async function fetchAvailability(libraryId: string, isbn13: string) {
  const body = await fetchXml("bookExist", {
    libCode: libraryId,
    isbn13,
  });
  const result = (body.result as Record<string, unknown> | undefined) ?? {};

  return {
    hasBook: readBoolean(result.hasBook),
    loanAvailable: readBoolean(result.loanAvailable),
  };
}

async function buildLiveResults(resolvedBook: BookCandidate, userLocation: UserLocation) {
  const regionCode = await resolveRegionCode(userLocation);

  if (!regionCode) {
    throw new Data4LibraryError("upstream", "지역 코드를 확인하지 못했습니다.");
  }

  const libraryCandidates = await fetchLibrariesByBook(resolvedBook.isbn13, regionCode);
  const nearestLibraries = libraryCandidates
    .map((library) => ({
      library,
      distanceKm: getDistanceKm(userLocation, library),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 8);

  const checkedAt = getCheckedAtLabel();
  let partialAvailability = false;

  const results = (
    await Promise.all(
      nearestLibraries.map(async ({ library, distanceKm }) => {
        const etaMinutes = estimateDrivingMinutes(distanceKm);

        try {
          const availability = await fetchAvailability(library.id, resolvedBook.isbn13);

          return {
            library,
            distanceKm,
            etaMinutes,
            travelTimes: buildTravelTimes(distanceKm, etaMinutes),
            hasBook: availability.hasBook,
            loanAvailable: availability.loanAvailable,
            availabilityChecked: true,
            checkedAt,
            score: computeScore({
              distanceKm,
              etaMinutes,
              loanAvailable: availability.loanAvailable,
              hasBook: availability.hasBook,
            }),
          } satisfies SearchResult;
        } catch {
          partialAvailability = true;

          return {
            library,
            distanceKm,
            etaMinutes,
            travelTimes: buildTravelTimes(distanceKm, etaMinutes),
            hasBook: true,
            loanAvailable: false,
            availabilityChecked: false,
            checkedAt,
            score: computeScore({
              distanceKm,
              etaMinutes,
              loanAvailable: false,
              hasBook: true,
            }),
          } satisfies SearchResult;
        }
      }),
    )
  )
    .filter((result) => result.hasBook)
    .sort(compareSearchResults);

  const warnings = partialAvailability ? ["일부 대출 가능 여부 확인이 지연되었습니다."] : [];

  if (results.length === 0) {
    warnings.unshift("이 도서를 보유한 도서관을 찾지 못했습니다.");
  } else if (!results.some((result) => result.loanAvailable)) {
    warnings.unshift("정보나루 전일 기준으로는 대출 가능 도서관이 없어 예상 소요 시간 순으로 보여줍니다.");
  }

  return {
    results,
    warnings,
  };
}

export async function searchLiveBookmap(
  query: string,
  userLocation: UserLocation,
  selectedIsbn?: string,
): Promise<SearchResponse> {
  const books = await searchBookCandidates(query);

  if (!selectedIsbn) {
    return {
      query,
      books,
      resolvedBook: null,
      location: userLocation,
      results: [],
      warnings: books.length > 0 ? [] : ["검색 결과가 없습니다."],
      source: "live",
    };
  }

  const selectedFromList = books.find((book) => book.isbn13 === selectedIsbn) ?? null;
  const selectedFallback = selectedFromList ? null : await fetchBookCandidateByIsbn(selectedIsbn);
  const resolvedBook = selectedFromList ?? selectedFallback;
  const candidateBooks =
    selectedFallback && !books.some((book) => book.isbn13 === selectedFallback.isbn13)
      ? [selectedFallback, ...books].slice(0, 8)
      : books;

  if (!resolvedBook) {
    return {
      query,
      books: candidateBooks,
      resolvedBook: null,
      location: userLocation,
      results: [],
      warnings: ["선택한 도서를 찾지 못했습니다. 다시 검색해 주세요."],
      source: "live",
    };
  }

  const { results, warnings } = await buildLiveResults(resolvedBook, userLocation);

  return {
    query,
    books: candidateBooks,
    resolvedBook,
    location: userLocation,
    results,
    warnings,
    source: "live",
  };
}
