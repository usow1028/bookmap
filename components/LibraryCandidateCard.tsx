"use client";

import { formatEta } from "@/lib/format";
import { buildLibraryHomepageSearchLaunchUrl } from "@/lib/library-homepage-search";
import { openNaverMapRoute } from "@/lib/naver-map-app";
import { BookCandidate, SearchResult, UserLocation } from "@/lib/types";

type LibraryCandidateCardProps = {
  book: BookCandidate | null;
  result: SearchResult;
  userLocation: UserLocation;
  isSelected: boolean;
  onSelect: (libraryId: string) => void;
};

export function LibraryCandidateCard({
  book,
  result,
  userLocation,
  isSelected,
  onSelect,
}: LibraryCandidateCardProps) {
  const availabilityLabel = !result.availabilityChecked
    ? "확인 필요"
    : result.availabilitySource === "homepage"
      ? result.availabilityStatus === "available"
        ? "홈페이지 기준 대출 가능"
        : result.availabilityStatus === "reservation-only"
          ? "홈페이지 기준 예약 가능"
          : "홈페이지 기준 대출 불가"
      : result.loanAvailable
        ? "정보나루 기준 가능"
        : "정보나루 기준 불가";
  const availabilityClassName = !result.availabilityChecked
    ? "is-unknown"
    : result.availabilityStatus === "available"
      ? "is-available"
      : result.availabilityStatus === "reservation-only"
        ? "is-reservation"
        : "is-unavailable";
  const availabilityNote = !result.availabilityChecked
    ? "대출 상태를 확인하지 못했습니다. 예약하기에서 다시 확인해 주세요."
    : result.availabilitySource === "homepage"
      ? `${result.checkedAt} 홈페이지 상세 상태${result.availabilityDetail ? ` · ${result.availabilityDetail}` : ""}`
      : `정보나루 전일 기준 ${result.checkedAt} · 예약하기에서 실제 상태를 다시 확인해 주세요.`;
  const handleActivate = () => onSelect(result.library.id);
  const openRoute = () =>
    openNaverMapRoute({
      start: userLocation,
      destination: {
        label: result.library.name,
        lat: result.library.lat,
        lng: result.library.lng,
      },
    });
  const homepageSearchUrl = result.library.homepage
    ? buildLibraryHomepageSearchLaunchUrl(result.library.homepage, book)
    : "";

  return (
    <article
      className={`library-candidate-card ${isSelected ? "is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="library-candidate-head">
        <div className="library-candidate-name-row">
          <strong className="library-candidate-name">{result.library.name}</strong>
        </div>
        <span className={`library-availability-pill ${availabilityClassName}`}>
          {availabilityLabel}
        </span>
      </div>

      <p className="library-candidate-address">{result.library.address}</p>
      <p className="library-candidate-note">{availabilityNote}</p>

      <div className="library-candidate-times">
        <span>도보 {formatEta(result.travelTimes.walk)}</span>
        <span>자전거 {formatEta(result.travelTimes.bike)}</span>
        <span>차량 {formatEta(result.travelTimes.car)}</span>
      </div>

      <div className="library-candidate-actions">
        {homepageSearchUrl ? (
          <a
            className="candidate-link-button"
            href={homepageSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            예약하기
          </a>
        ) : null}
        <button
          className="candidate-route-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openRoute();
          }}
        >
          <span className="candidate-naver-icon" aria-hidden="true">
            N
          </span>
          네이버 지도
        </button>
      </div>
    </article>
  );
}
