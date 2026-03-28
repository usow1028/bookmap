import { books, holdingsByIsbn, libraries } from "@/lib/mock-data";
import { Data4LibraryError, hasData4LibraryKey, searchLiveBookmap } from "@/lib/data4library";
import { estimateTransitMinutes, getDistanceKm } from "@/lib/geo";
import { resolveUserLocation } from "@/lib/location";
import { getDrivingRouteSummary, hasNaverMapsCredentials } from "@/lib/naver-maps";
import { BookCandidate, SearchResponse, UserLocation } from "@/lib/types";

function normalizeInput(value: string) {
  return value.trim().toLowerCase();
}

function matchBook(query: string): BookCandidate | null {
  const normalized = normalizeInput(query);

  if (!normalized) {
    return null;
  }

  const exactIsbn = books.find((book) => book.isbn13 === normalized);

  if (exactIsbn) {
    return exactIsbn;
  }

  const partial = books.find((book) => {
    const candidates = [book.title, book.author, book.publisher, ...book.tags];
    return candidates.some((candidate) => normalizeInput(candidate).includes(normalized));
  });

  return partial ?? null;
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

  if (left.distanceKm !== right.distanceKm) {
    return left.distanceKm - right.distanceKm;
  }

  if (left.etaMinutes !== right.etaMinutes) {
    return left.etaMinutes - right.etaMinutes;
  }

  return right.score - left.score;
}

function searchMockBookmap(
  query: string,
  userLocation: UserLocation,
  warning?: string,
): SearchResponse {
  const resolvedBook = matchBook(query);

  if (!resolvedBook) {
    return {
      query,
      resolvedBook: null,
      location: userLocation,
      results: [],
      warnings: warning
        ? ["검색 결과가 없습니다.", warning]
        : ["검색어와 일치하는 샘플 서지를 찾지 못했습니다. 제목, 저자, ISBN으로 다시 시도해 주세요."],
      source: "mock",
    };
  }

  const holdings = holdingsByIsbn[resolvedBook.isbn13] ?? [];

  const results = holdings
    .map((holding) => {
      const library = libraries.find((item) => item.id === holding.libraryId);

      if (!library) {
        return null;
      }

      const distanceKm = getDistanceKm(userLocation, library);
      const etaMinutes = estimateTransitMinutes(distanceKm);
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
        hasBook: holding.hasBook,
        loanAvailable: holding.loanAvailable,
        checkedAt: holding.checkedAt,
        score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(compareSearchResults)
    .slice(0, 10);

  return {
    query,
    resolvedBook,
    location: userLocation,
    results,
    warnings: warning ? [warning] : [],
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

  const topCount = response.source === "live" ? 5 : response.results.length;
  const topCandidates = response.results.slice(0, topCount);
  const rest = response.results.slice(topCount);

  const reranked = await Promise.all(
    topCandidates.map(async (result) => {
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
    results: [...reranked, ...rest].sort(compareSearchResults),
  };
}

export async function searchBookmap(
  query: string,
  location?: Partial<UserLocation>,
): Promise<SearchResponse> {
  const userLocation = await resolveUserLocation(location);

  if (!hasData4LibraryKey()) {
    return applyRouteRecommendations(
      searchMockBookmap(
        query,
        userLocation,
        "실데이터 인증키가 없어 샘플 데이터를 표시합니다.",
      ),
    );
  }

  try {
    return await applyRouteRecommendations(await searchLiveBookmap(query, userLocation));
  } catch (error) {
    return applyRouteRecommendations(
      searchMockBookmap(
        query,
        userLocation,
        getFallbackWarning(error),
      ),
    );
  }
}
