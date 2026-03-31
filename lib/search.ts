import {
  estimateCyclingMinutes,
  estimateDrivingMinutes,
  estimateWalkingMinutes,
} from "@/lib/geo";
import { Data4LibraryError, hasData4LibraryKey, searchLiveBookmap } from "@/lib/data4library";
import { resolveUserLocation } from "@/lib/location";
import { getDrivingRouteSummary, hasNaverMapsCredentials } from "@/lib/naver-maps";
import { SearchResponse, SearchResult, UserLocation } from "@/lib/types";

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

function compareSearchResults(left: SearchResult, right: SearchResult) {
  if (left.loanAvailable !== right.loanAvailable) {
    return left.loanAvailable ? -1 : 1;
  }

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

function buildEmptySearchResponse(
  query: string,
  userLocation: UserLocation,
  warning: string,
): SearchResponse {
  return {
    query,
    books: [],
    resolvedBook: null,
    location: userLocation,
    results: [],
    warnings: [warning],
    source: "live",
  };
}

function getSearchWarning(error?: unknown) {
  if (error instanceof Data4LibraryError) {
    if (error.kind === "config") {
      return "정보나루 인증키가 설정되지 않았습니다.";
    }

    if (error.message.includes("API 활성화 상태가아닙니다")) {
      return "정보나루 인증키가 아직 활성화되지 않았습니다.";
    }

    if (error.message.includes("인증정보가 일치하지 않습니다")) {
      return "정보나루 인증키가 올바르지 않습니다.";
    }
  }

  return "실데이터 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.";
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

function applyRouteRecommendationsSafely(response: SearchResponse) {
  return applyRouteRecommendations(response).catch(() => response);
}

export async function searchBookmap(
  query: string,
  location?: Partial<UserLocation>,
  selectedIsbn?: string,
): Promise<SearchResponse> {
  const userLocation = await resolveUserLocation(location);

  if (!hasData4LibraryKey()) {
    return buildEmptySearchResponse(query, userLocation, "정보나루 인증키가 설정되지 않았습니다.");
  }

  try {
    return await applyRouteRecommendationsSafely(
      await searchLiveBookmap(query, userLocation, selectedIsbn),
    );
  } catch (error) {
    return buildEmptySearchResponse(query, userLocation, getSearchWarning(error));
  }
}
