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

function computeScore(params: {
  distanceKm: number;
  etaMinutes: number;
  loanAvailable: boolean;
  hasBook: boolean;
}) {
  const holdingWeight = params.hasBook ? 25 : 0;
  const loanWeight = params.loanAvailable ? 30 : -10;
  const distancePenalty = params.distanceKm * 4.2;
  const etaPenalty = params.etaMinutes * 0.7;

  return Math.round(100 + holdingWeight + loanWeight - distancePenalty - etaPenalty);
}

function compareSearchResults(left: SearchResult, right: SearchResult) {
  if (left.loanAvailable !== right.loanAvailable) {
    return left.loanAvailable ? -1 : 1;
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

  const body = await fetchXml("srchBooks", {
    isbn13: /^\d{13}$/.test(trimmed) ? trimmed : undefined,
    keyword: /^\d{13}$/.test(trimmed) ? undefined : trimmed,
    pageNo: 1,
    pageSize: limit,
    exactMatch: "false",
  });

  const docs = asArray(
    (body.docs as { doc?: Record<string, unknown> | Array<Record<string, unknown>> } | undefined)?.doc,
  );

  return docs
    .map((doc) => mapDocToBookCandidate(doc))
    .filter((candidate): candidate is BookCandidate => Boolean(candidate));
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
        openHours: "운영 정보는 홈페이지 확인",
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
    warnings.unshift("현재 확인된 결과 중 즉시 대출 가능한 도서관이 없어 예상 소요 시간 순으로 보여줍니다.");
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
