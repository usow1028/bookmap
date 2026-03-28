import { books, defaultLocation, holdingsByIsbn, libraries } from "@/lib/mock-data";
import { Data4LibraryError, hasData4LibraryKey, searchLiveBookmap } from "@/lib/data4library";
import {
  estimateCyclingMinutes,
  estimateDrivingMinutes,
  estimateWalkingMinutes,
  getDistanceKm,
} from "@/lib/geo";
import { resolveUserLocation } from "@/lib/location";
import { getDrivingRouteSummary, hasNaverMapsCredentials } from "@/lib/naver-maps";
import { BookCandidate, SearchResponse, UserLocation } from "@/lib/types";

function normalizeInput(value: string) {
  return value.trim().toLowerCase();
}

function computeBookMatchScore(book: BookCandidate, query: string) {
  const normalizedTitle = normalizeInput(book.title);
  const normalizedAuthor = normalizeInput(book.author);
  const normalizedPublisher = normalizeInput(book.publisher);
  const normalizedTags = book.tags.map((tag) => normalizeInput(tag));

  if (book.isbn13 === query) {
    return 200;
  }

  if (normalizedTitle === query) {
    return 160;
  }

  if (normalizedTitle.startsWith(query)) {
    return 120;
  }

  if (normalizedTitle.includes(query)) {
    return 100;
  }

  if (normalizedAuthor.includes(query)) {
    return 70;
  }

  if (normalizedPublisher.includes(query)) {
    return 50;
  }

  if (normalizedTags.some((tag) => tag.includes(query))) {
    return 40;
  }

  return 0;
}

function searchMockBooks(query: string, limit = 8) {
  const normalized = normalizeInput(query);

  if (!normalized) {
    return [];
  }

  return books
    .map((book) => ({
      book,
      score: computeBookMatchScore(book, normalized),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.book.title.localeCompare(right.book.title, "ko"))
    .slice(0, limit)
    .map((entry) => entry.book);
}

function buildTravelTimes(distanceKm: number, carMinutes: number) {
  return {
    walk: estimateWalkingMinutes(distanceKm),
    bike: estimateCyclingMinutes(distanceKm),
    car: carMinutes,
  };
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

function compareSearchResults(left: {
  loanAvailable: boolean;
  hasBook: boolean;
  distanceKm: number;
  etaMinutes: number;
  score: number;
}, right: {
  loanAvailable: boolean;
  hasBook: boolean;
  distanceKm: number;
  etaMinutes: number;
  score: number;
}) {
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

function searchMockBookmap(
  query: string,
  userLocation: UserLocation,
  selectedIsbn?: string,
  warning?: string,
): SearchResponse {
  const candidateBooks = searchMockBooks(query);

  if (!selectedIsbn) {
    return {
      query,
      books: candidateBooks,
      resolvedBook: null,
      location: userLocation,
      results: [],
      warnings:
        candidateBooks.length > 0
          ? warning
            ? [warning]
            : []
          : [
              "검색어와 일치하는 도서를 찾지 못했습니다. 제목, 저자, ISBN으로 다시 시도해 주세요.",
              ...(warning ? [warning] : []),
            ],
      source: "mock",
    };
  }

  const selectedBook =
    candidateBooks.find((book) => book.isbn13 === selectedIsbn) ??
    books.find((book) => book.isbn13 === selectedIsbn) ??
    null;
  const booksForResponse =
    selectedBook && !candidateBooks.some((book) => book.isbn13 === selectedBook.isbn13)
      ? [selectedBook, ...candidateBooks].slice(0, 8)
      : candidateBooks;

  if (!selectedBook) {
    return {
      query,
      books: booksForResponse,
      resolvedBook: null,
      location: userLocation,
      results: [],
      warnings: ["선택한 도서를 찾지 못했습니다. 다시 검색해 주세요.", ...(warning ? [warning] : [])],
      source: "mock",
    };
  }

  const holdings = (holdingsByIsbn[selectedBook.isbn13] ?? []).filter((holding) => holding.hasBook);

  const results = holdings
    .map((holding) => {
      const library = libraries.find((item) => item.id === holding.libraryId);

      if (!library) {
        return null;
      }

      const distanceKm = getDistanceKm(userLocation, library);
      const etaMinutes = estimateDrivingMinutes(distanceKm);
      const score = computeScore({
        distanceKm,
        etaMinutes,
        loanAvailable: holding.loanAvailable,
        hasBook: holding.hasBook,
      });

      return {
        library,
        distanceKm,
        etaMinutes,
        travelTimes: buildTravelTimes(distanceKm, etaMinutes),
        hasBook: holding.hasBook,
        loanAvailable: holding.loanAvailable,
        checkedAt: holding.checkedAt,
        score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(compareSearchResults)
    .slice(0, 8);

  const warnings = warning ? [warning] : [];

  if (results.length === 0) {
    warnings.unshift("이 도서를 보유한 도서관을 찾지 못했습니다.");
  } else if (!results.some((result) => result.loanAvailable)) {
    warnings.unshift("현재 확인된 결과 중 즉시 대출 가능한 도서관이 없어 예상 소요 시간 순으로 보여줍니다.");
  }

  return {
    query,
    books: booksForResponse,
    resolvedBook: selectedBook,
    location: userLocation,
    results,
    warnings,
    source: "mock",
  };
}

function getFallbackWarning(error?: unknown) {
  if (error instanceof Data4LibraryError) {
    if (error.message.includes("API 활성화 상태가아닙니다")) {
      return "정보나루 인증키가 아직 활성화되지 않아 샘플 데이터를 표시합니다.";
    }

    if (error.message.includes("인증정보가 일치하지 않습니다")) {
      return "정보나루 인증키가 올바르지 않아 샘플 데이터를 표시합니다.";
    }
  }

  return "실데이터 조회에 실패해 샘플 데이터를 표시합니다.";
}

async function applyRouteRecommendations(
  response: SearchResponse,
): Promise<SearchResponse> {
  if (!hasNaverMapsCredentials() || response.results.length === 0) {
    return response;
  }

  const reranked = await Promise.all(
    response.results.map(async (result) => {
      try {
        const route = await getDrivingRouteSummary({
          start: response.location,
          goal: {
            lat: result.library.lat,
            lng: result.library.lng,
          },
        });
        const score = computeScore({
          distanceKm: route.distanceKm,
          etaMinutes: route.etaMinutes,
          loanAvailable: result.loanAvailable,
          hasBook: result.hasBook,
        });

        return {
          ...result,
          distanceKm: route.distanceKm,
          etaMinutes: route.etaMinutes,
          travelTimes: buildTravelTimes(route.distanceKm, route.etaMinutes),
          score,
          routePath: route.routePath,
        };
      } catch {
        return result;
      }
    }),
  );

  return {
    ...response,
    results: reranked.sort(compareSearchResults),
  };
}

function getSafeUserLocation(location?: Partial<UserLocation>): UserLocation {
  const label = location?.label?.trim() || defaultLocation.label;
  const lat =
    typeof location?.lat === "number" && Number.isFinite(location.lat)
      ? location.lat
      : defaultLocation.lat;
  const lng =
    typeof location?.lng === "number" && Number.isFinite(location.lng)
      ? location.lng
      : defaultLocation.lng;

  return {
    label,
    lat,
    lng,
  };
}

function applyRouteRecommendationsSafely(response: SearchResponse) {
  return applyRouteRecommendations(response).catch(() => response);
}

export async function searchBookmap(
  query: string,
  location?: Partial<UserLocation>,
  selectedIsbn?: string,
): Promise<SearchResponse> {
  let userLocation = getSafeUserLocation(location);

  try {
    userLocation = await resolveUserLocation(location);
  } catch {
    // Keep the safe fallback location when resolution providers fail.
  }

  if (!hasData4LibraryKey()) {
    return applyRouteRecommendationsSafely(
      searchMockBookmap(
        query,
        userLocation,
        selectedIsbn,
        "실데이터 인증키가 없어 샘플 데이터를 표시합니다.",
      ),
    );
  }

  try {
    return await applyRouteRecommendationsSafely(
      await searchLiveBookmap(query, userLocation, selectedIsbn),
    );
  } catch (error) {
    return applyRouteRecommendationsSafely(
      searchMockBookmap(
        query,
        userLocation,
        selectedIsbn,
        getFallbackWarning(error),
      ),
    );
  }
}
