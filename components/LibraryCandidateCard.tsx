"use client";

import { formatEta } from "@/lib/format";
import { openNaverMapRoute } from "@/lib/naver-map-app";
import { SearchResult, UserLocation } from "@/lib/types";

type LibraryCandidateCardProps = {
  result: SearchResult;
  userLocation: UserLocation;
  isSelected: boolean;
  onSelect: (libraryId: string) => void;
};

export function LibraryCandidateCard({
  result,
  userLocation,
  isSelected,
  onSelect,
}: LibraryCandidateCardProps) {
  const availabilityLabel = result.loanAvailable ? "대출 가능" : "대출 불가";
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
        <span className={`library-availability-pill ${result.loanAvailable ? "is-available" : "is-unavailable"}`}>
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
        <a
          className="candidate-link-button"
          href={result.library.homepage}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          홈페이지
        </a>
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
