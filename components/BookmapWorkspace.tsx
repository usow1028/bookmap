"use client";

import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useState } from "react";
import { defaultLocation } from "@/lib/mock-data";
import { formatDistance, formatEta } from "@/lib/format";
import { LocationSuggestion, SearchResponse } from "@/lib/types";
import { LibraryMap } from "@/components/LibraryMap";

const SAVED_LOCATION_KEY = "bookmap.savedLocation";

type BookmapWorkspaceProps = {
  initialQuery?: string;
  initialLocationLabel?: string;
  initialLat?: number;
  initialLng?: number;
  initialResponse?: SearchResponse | null;
};

export function BookmapWorkspace({
  initialQuery = "",
  initialLocationLabel = defaultLocation.label,
  initialLat,
  initialLng,
  initialResponse = null,
}: BookmapWorkspaceProps) {
  const canHydrateSavedLocation =
    typeof initialLat !== "number" &&
    typeof initialLng !== "number" &&
    !initialResponse &&
    initialLocationLabel.trim() === defaultLocation.label;
  const resolvedInitialCoordinates =
    typeof initialLat === "number" && typeof initialLng === "number"
      ? { lat: initialLat, lng: initialLng }
      : initialResponse
        ? {
            lat: initialResponse.location.lat,
            lng: initialResponse.location.lng,
          }
        : null;
  const [query, setQuery] = useState(initialQuery);
  const [locationLabel, setLocationLabel] = useState(initialLocationLabel);
  const [coordinates, setCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(resolvedInitialCoordinates);
  const [locationDetail, setLocationDetail] = useState("");
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(Boolean(resolvedInitialCoordinates));
  const [isLocationEditorOpen, setIsLocationEditorOpen] = useState(!resolvedInitialCoordinates);
  const [hasLocationInputChanged, setHasLocationInputChanged] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const [response, setResponse] = useState<SearchResponse | null>(initialResponse);
  const [message, setMessage] = useState(() => {
    if (!initialResponse) {
      return "";
    }

    if (initialResponse.warnings[0]) {
      return initialResponse.warnings[0];
    }

    if (!initialResponse.resolvedBook) {
      return "검색 결과가 없습니다.";
    }

    return `${initialResponse.results.length}곳을 찾았습니다.`;
  });
  const [isLoading, setIsLoading] = useState(false);
  const suggestionListId = useId();

  const bestResult = response?.results[0] ?? null;
  const visibleLocation = {
    label: response?.location.label || locationLabel || defaultLocation.label,
    lat: response?.location.lat ?? coordinates?.lat ?? defaultLocation.lat,
    lng: response?.location.lng ?? coordinates?.lng ?? defaultLocation.lng,
    accuracyMeters: locationAccuracyMeters ?? undefined,
  };

  const overlayText = useMemo(() => {
    if (!response) {
      return "위치와 책 제목을 입력하면 도서관 위치가 지도에 표시됩니다.";
    }

    if (!bestResult) {
      return "검색 결과가 없습니다.";
    }

    return `${bestResult.library.name} · ${formatDistance(bestResult.distanceKm)} · ${formatEta(bestResult.etaMinutes)}`;
  }, [bestResult, response]);

  useEffect(() => {
    if (!canHydrateSavedLocation || typeof window === "undefined") {
      return;
    }

    try {
      const savedValue = window.localStorage.getItem(SAVED_LOCATION_KEY);

      if (!savedValue) {
        return;
      }

      const savedLocation = JSON.parse(savedValue) as {
        label?: string;
        detail?: string;
        lat?: number;
        lng?: number;
      };

      if (
        typeof savedLocation.label === "string" &&
        typeof savedLocation.lat === "number" &&
        Number.isFinite(savedLocation.lat) &&
        typeof savedLocation.lng === "number" &&
        Number.isFinite(savedLocation.lng)
      ) {
        setLocationLabel(savedLocation.label);
        setLocationDetail(typeof savedLocation.detail === "string" ? savedLocation.detail : "");
        setCoordinates({
          lat: savedLocation.lat,
          lng: savedLocation.lng,
        });
        setLocationAccuracyMeters(null);
        setIsLocationConfirmed(true);
        setIsLocationEditorOpen(false);
        setHasLocationInputChanged(false);
      }
    } catch {
      // Ignore storage parsing failures and continue with the default location.
    }
  }, [canHydrateSavedLocation]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !coordinates ||
      !isLocationConfirmed ||
      !locationLabel.trim() ||
      locationLabel.includes("확인 중")
    ) {
      return;
    }

    window.localStorage.setItem(
      SAVED_LOCATION_KEY,
      JSON.stringify({
        label: locationLabel.trim(),
        detail: locationDetail.trim(),
        lat: coordinates.lat,
        lng: coordinates.lng,
      }),
    );
  }, [coordinates, isLocationConfirmed, locationDetail, locationLabel]);

  useEffect(() => {
    const trimmed = locationLabel.trim();

    if (isLocationConfirmed || !isLocationEditorOpen || !hasLocationInputChanged || trimmed.length < 2) {
      setLocationSuggestions([]);
      setIsSuggestionOpen(false);
      setIsSuggestionLoading(false);
      setHighlightedSuggestionIndex(0);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSuggestionLoading(true);

      try {
        const apiResponse = await fetch(
          `/api/location-suggestions?query=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
          },
        );

        if (!apiResponse.ok) {
          throw new Error("location_suggestions_failed");
        }

        const payload = (await apiResponse.json()) as {
          suggestions?: LocationSuggestion[];
        };
        const nextSuggestions = payload.suggestions ?? [];

        setLocationSuggestions(nextSuggestions);
        setIsSuggestionOpen(nextSuggestions.length > 0);
        setHighlightedSuggestionIndex(0);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(error);
        setLocationSuggestions([]);
        setIsSuggestionOpen(false);
      } finally {
        if (!controller.signal.aborted) {
          setIsSuggestionLoading(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [hasLocationInputChanged, isLocationConfirmed, isLocationEditorOpen, locationLabel]);

  function applyLocationSuggestion(suggestion: LocationSuggestion) {
    setLocationLabel(suggestion.label);
    setLocationDetail(suggestion.detail ?? "");
    setCoordinates({
      lat: suggestion.lat,
      lng: suggestion.lng,
    });
    setLocationAccuracyMeters(null);
    setIsLocationConfirmed(true);
    setLocationSuggestions([]);
    setIsSuggestionOpen(false);
    setHighlightedSuggestionIndex(0);
    setIsLocationEditorOpen(false);
    setHasLocationInputChanged(false);
    setMessage("주소가 적용되었습니다.");
  }

  function startLocationEdit() {
    setIsLocationEditorOpen(true);
    setMessage("위치를 바꾸려면 주소를 다시 입력하거나 현재 위치를 사용하세요.");
  }

  function handleLocationInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!locationSuggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setHighlightedSuggestionIndex((current) => (current + 1) % locationSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setHighlightedSuggestionIndex((current) =>
        current === 0 ? locationSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && isSuggestionOpen) {
      event.preventDefault();
      applyLocationSuggestion(
        locationSuggestions[highlightedSuggestionIndex] ?? locationSuggestions[0],
      );
      return;
    }

    if (event.key === "Escape") {
      setIsSuggestionOpen(false);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      setMessage("찾고 싶은 책을 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        location: locationLabel.trim() || defaultLocation.label,
      });

      if (coordinates) {
        params.set("lat", String(coordinates.lat));
        params.set("lng", String(coordinates.lng));
      }

      const apiResponse = await fetch(`/api/search?${params.toString()}`);

      if (!apiResponse.ok) {
        throw new Error("search_failed");
      }

      const payload = (await apiResponse.json()) as SearchResponse;
      setResponse(payload);
      window.history.replaceState(null, "", `/?${params.toString()}`);

      if (!payload.resolvedBook) {
        setMessage(payload.warnings[0] ?? "검색 결과가 없습니다.");
        return;
      }

      setMessage(payload.warnings[0] ?? `${payload.results.length}곳을 찾았습니다.`);
    } catch {
      setMessage("검색 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("현재 위치를 사용할 수 없습니다.");
      return;
    }

    setMessage("현재 위치를 확인하는 중입니다.");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCoordinates(nextCoordinates);
        setLocationAccuracyMeters(
          typeof position.coords.accuracy === "number" && Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
        );
        setLocationLabel("현재 위치 확인 중...");
        setIsLocationConfirmed(true);
        setIsLocationEditorOpen(false);
        setHasLocationInputChanged(false);
        setLocationSuggestions([]);
        setIsSuggestionOpen(false);

        try {
          const apiResponse = await fetch(
            `/api/location-reverse?lat=${nextCoordinates.lat}&lng=${nextCoordinates.lng}`,
          );

          if (!apiResponse.ok) {
            throw new Error("location_reverse_failed");
          }

          const payload = (await apiResponse.json()) as {
            location?: LocationSuggestion | null;
          };
          const resolvedLocation = payload.location;

          if (resolvedLocation) {
            setLocationLabel(resolvedLocation.label);
            setLocationDetail(resolvedLocation.detail ?? "");
            setMessage("현재 위치의 상세 주소를 반영했습니다.");
            return;
          }
        } catch (error) {
          console.error(error);
        }

        setLocationLabel(
          `현재 위치 (${nextCoordinates.lat.toFixed(5)}, ${nextCoordinates.lng.toFixed(5)})`,
        );
        setLocationDetail("");
        setMessage("현재 위치 좌표를 반영했습니다.");
      },
      () => {
        setMessage("현재 위치를 가져오지 못했습니다.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
      },
    );
  }

  return (
    <section className="workspace-grid">
      <div className="panel-card control-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">BOOKMAP</p>
            <h1 className="panel-title">가까운 도서관 찾기</h1>
          </div>
        </div>

        <form className="minimal-form" onSubmit={submitSearch}>
          {isLocationConfirmed && !isLocationEditorOpen ? (
            <div className="saved-location-card">
              <div className="saved-location-copy">
                <p className="saved-location-label">저장된 위치</p>
                <strong>{locationLabel}</strong>
                {locationDetail ? <p className="saved-location-meta">{locationDetail}</p> : null}
                <p>이 위치를 기준으로 이후 검색에서는 책 제목만 입력해도 됩니다.</p>
              </div>
              <button className="secondary-button slim-button" type="button" onClick={startLocationEdit}>
                위치 변경
              </button>
            </div>
          ) : (
            <div className="field-block">
              <label htmlFor="location-input">나의 위치</label>
              <div className="location-row">
                <div className="location-input-wrap">
                  <input
                    id="location-input"
                    className="text-input"
                    value={locationLabel}
                    onChange={(event) => {
                      setLocationLabel(event.target.value);
                      setLocationDetail("");
                      setCoordinates(null);
                      setLocationAccuracyMeters(null);
                      setIsLocationConfirmed(false);
                      setHasLocationInputChanged(true);
                    }}
                    onFocus={() => {
                      if (locationSuggestions.length > 0) {
                        setIsSuggestionOpen(true);
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => {
                        setIsSuggestionOpen(false);
                      }, 120);
                    }}
                    onKeyDown={handleLocationInputKeyDown}
                    placeholder="주소 또는 지역명"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls={suggestionListId}
                    aria-haspopup="listbox"
                    aria-expanded={isSuggestionOpen}
                    aria-activedescendant={
                      isSuggestionOpen && locationSuggestions[highlightedSuggestionIndex]
                        ? `${suggestionListId}-${highlightedSuggestionIndex}`
                        : undefined
                    }
                  />
                  {isSuggestionOpen && locationSuggestions.length > 0 ? (
                    <div className="location-suggestion-panel" id={suggestionListId} role="listbox">
                      {locationSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
                          id={`${suggestionListId}-${index}`}
                          className={`location-suggestion-button ${
                            index === highlightedSuggestionIndex ? "is-active" : ""
                          }`}
                          type="button"
                          role="option"
                          aria-selected={index === highlightedSuggestionIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                          onClick={() => applyLocationSuggestion(suggestion)}
                        >
                          <strong>{suggestion.label}</strong>
                          {suggestion.detail ? <span>{suggestion.detail}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="secondary-button" type="button" onClick={requestCurrentLocation}>
                  현재 위치
                </button>
              </div>
              {isSuggestionLoading ? (
                <p className="field-helper-text">입력한 주소를 바탕으로 추천 위치를 찾는 중입니다.</p>
              ) : (
                <p className="field-helper-text">
                  위치는 한 번만 정하면 저장되며, 이후에는 책 제목만 입력해도 됩니다.
                </p>
              )}
            </div>
          )}

          <div className="field-block">
            <label htmlFor="query-input">찾고 싶은 책</label>
            <input
              id="query-input"
              className="text-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 저자, ISBN"
            />
          </div>

          <button className="primary-button full-width" type="submit" disabled={isLoading}>
            {isLoading ? "검색 중..." : "지도에 표시"}
          </button>
        </form>

        <div className="minimal-status">
          <p>{message || "입력 후 검색하면 결과가 지도에 표시됩니다."}</p>
          {bestResult ? (
            <div className="best-result">
              <strong>{bestResult.library.name}</strong>
              <span>
                {formatDistance(bestResult.distanceKm)} · {formatEta(bestResult.etaMinutes)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel-card map-panel">
        <LibraryMap userLocation={visibleLocation} results={response?.results ?? []} />
        <div className="map-overlay-card">
          <span className="overlay-label">
            {response
              ? `${response.source === "live" ? "실데이터" : "샘플"} · ${response.results.length}곳`
              : "지도"}
          </span>
          <strong>{response?.resolvedBook?.title ?? "검색 결과가 여기에 표시됩니다."}</strong>
          <p>{overlayText}</p>
        </div>
      </div>
    </section>
  );
}
