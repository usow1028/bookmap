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
    : result.loanAvailable
      ? "대출 가능"
      : "대출 불가";
  const availabilityClassName = !result.availabilityChecked
    ? "is-unknown"
    : result.loanAvailable
      ? "is-available"
      : "is-unavailable";
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
