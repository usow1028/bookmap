"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { books, sampleLocations } from "@/lib/mock-data";

type SearchFormProps = {
  initialQuery?: string;
  initialLocationLabel?: string;
  initialLat?: number;
  initialLng?: number;
  compact?: boolean;
};

export function SearchForm({
  initialQuery = "",
  initialLocationLabel = sampleLocations[0].label,
  initialLat = sampleLocations[0].lat,
  initialLng = sampleLocations[0].lng,
  compact = false,
}: SearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [locationLabel, setLocationLabel] = useState(initialLocationLabel);
  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);
  const [geoMessage, setGeoMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const queryExamples = useMemo(() => books.slice(0, 4), []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      setGeoMessage("검색어를 먼저 입력해 주세요.");
      return;
    }

    const params = new URLSearchParams({
      q: query.trim(),
      location: locationLabel.trim() || "현재 위치",
      lat: String(lat),
      lng: String(lng),
    });

    startTransition(() => {
      router.push(`/search?${params.toString()}`);
    });
  }

  function applySampleLocation(label: string, nextLat: number, nextLng: number) {
    setLocationLabel(label);
    setLat(nextLat);
    setLng(nextLng);
    setGeoMessage("");
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoMessage("이 브라우저에서는 위치 권한을 사용할 수 없습니다.");
      return;
    }

    setGeoMessage("현재 위치를 확인하는 중입니다...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLocationLabel("현재 위치");
        setGeoMessage("현재 위치가 적용되었습니다.");
      },
      () => {
        setGeoMessage("현재 위치를 가져오지 못했습니다. 예시 위치를 사용해 주세요.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
      },
    );
  }

  return (
    <form className={`search-form ${compact ? "compact" : ""}`} onSubmit={submitSearch}>
      <div className="field-block">
        <label htmlFor="search-query">찾고 싶은 책</label>
        <input
          id="search-query"
          className="text-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="제목, 저자, ISBN을 입력"
        />
      </div>

      <div className="field-block">
        <label htmlFor="search-location">출발 위치</label>
        <div className="location-row">
          <input
            id="search-location"
            className="text-input"
            value={locationLabel}
            onChange={(event) => setLocationLabel(event.target.value)}
            placeholder="주소를 입력하거나 현재 위치를 사용"
          />
          <button
            className="secondary-button"
            type="button"
            onClick={requestCurrentLocation}
          >
            현재 위치
          </button>
        </div>
      </div>

      <div className="form-foot">
        <div className="chip-group">
          {sampleLocations.map((sample) => (
            <button
              key={sample.label}
              className="chip-button"
              type="button"
              onClick={() => applySampleLocation(sample.label, sample.lat, sample.lng)}
            >
              {sample.label}
            </button>
          ))}
        </div>

        <div className="chip-group">
          {queryExamples.map((book) => (
            <button
              key={book.isbn13}
              className="chip-button strong"
              type="button"
              onClick={() => setQuery(book.title)}
            >
              {book.title}
            </button>
          ))}
        </div>
      </div>

      <div className="submit-row">
        <p className="helper-text">{geoMessage || "회원가입 없이 한 번의 검색으로 가까운 소장 도서관을 확인합니다."}</p>
        <button className="primary-button" type="submit" disabled={isPending}>
          {isPending ? "검색 준비 중..." : "지도에서 찾기"}
        </button>
      </div>
    </form>
  );
}
