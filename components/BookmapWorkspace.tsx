"use client";

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { defaultLocation } from "@/lib/mock-data";
import { BookCandidate, LocationSuggestion, SearchResponse } from "@/lib/types";
import { BookCoverImage } from "@/components/BookCoverImage";
import { LibraryCandidateCard } from "@/components/LibraryCandidateCard";
import { LibraryMap } from "@/components/LibraryMap";

const SAVED_LOCATION_KEY = "bookmap.savedLocation";

type SearchRequestState = {
  query: string;
  locationLabel: string;
  coordinateLat: number | null;
  coordinateLng: number | null;
  selectedIsbn?: string;
};

type BookmapWorkspaceProps = {
  initialQuery?: string;
  initialLocationLabel?: string;
  initialLat?: number;
  initialLng?: number;
  initialResponse?: SearchResponse | null;
};

function getSourceLabel(source: SearchResponse["source"] | null) {
  if (!source) {
    return "지도";
  }

  return source === "live" ? "실데이터" : "샘플";
}

function getLocationSuggestionBadge(suggestion: LocationSuggestion) {
  if (suggestion.kind === "place") {
    return "장소";
  }

  if (suggestion.kind === "preset") {
    return "저장 위치";
  }

  return "주소";
}

function canSearchBooks(query: string) {
  const trimmed = query.trim();

  return trimmed.length >= 2 || /^\d{13}$/.test(trimmed);
}

function buildSearchParams({
  query,
  locationLabel,
  coordinateLat,
  coordinateLng,
  selectedIsbn,
}: SearchRequestState) {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }

  if (locationLabel.trim()) {
    params.set("location", locationLabel.trim());
  }

  if (coordinateLat !== null && coordinateLng !== null) {
    params.set("lat", String(coordinateLat));
    params.set("lng", String(coordinateLng));
  }

  if (selectedIsbn) {
    params.set("isbn", selectedIsbn);
  }

  return params;
}

function syncUrlWithParams(params: URLSearchParams) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(null, "", params.size > 0 ? `/?${params.toString()}` : "/");
}

async function requestSearchResponse(
  request: SearchRequestState,
  signal?: AbortSignal,
) {
  const params = buildSearchParams(request);
  const apiResponse = await fetch(`/api/search?${params.toString()}`, signal ? { signal } : undefined);
  const payload = (await apiResponse.json().catch(() => null)) as
    | (SearchResponse & { error?: string })
    | null;

  if (!apiResponse.ok) {
    throw new Error(payload?.error || `search_failed_${apiResponse.status}`);
  }

  syncUrlWithParams(params);

  return payload as SearchResponse;
}

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
  const initialResolvedLocationLabel = initialResponse?.location.label ?? initialLocationLabel;
  const [query, setQuery] = useState(initialQuery);
  const [locationLabel, setLocationLabel] = useState(initialResolvedLocationLabel);
  const [committedLocationLabel, setCommittedLocationLabel] = useState(initialResolvedLocationLabel);
  const [committedCoordinates, setCommittedCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(resolvedInitialCoordinates);
  const [committedLocationDetail, setCommittedLocationDetail] = useState("");
  const [hasLocationInputChanged, setHasLocationInputChanged] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLocationSuggestionOpen, setIsLocationSuggestionOpen] = useState(false);
  const [isLocationSuggestionLoading, setIsLocationSuggestionLoading] = useState(false);
  const [highlightedLocationIndex, setHighlightedLocationIndex] = useState(0);
  const [bookSuggestions, setBookSuggestions] = useState<BookCandidate[]>(initialResponse?.books ?? []);
  const [isBookSuggestionLoading, setIsBookSuggestionLoading] = useState(false);
  const [isBookSuggestionOpen, setIsBookSuggestionOpen] = useState(false);
  const [highlightedBookIndex, setHighlightedBookIndex] = useState(0);
  const [selectedResponse, setSelectedResponse] = useState<SearchResponse | null>(
    initialResponse?.resolvedBook ? initialResponse : null,
  );
  const [activeBookIsbn, setActiveBookIsbn] = useState<string | null>(
    initialResponse?.resolvedBook?.isbn13 ?? null,
  );
  const [pendingBookIsbn, setPendingBookIsbn] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const locationSuggestionListId = useId();
  const bookSuggestionListId = useId();
  const committedLocationLabelRef = useRef(initialResolvedLocationLabel);
  const hasLocationInputChangedRef = useRef(false);
  const coordinateLat = committedCoordinates?.lat ?? null;
  const coordinateLng = committedCoordinates?.lng ?? null;
  const selectedResponseMatchesCommittedLocation =
    selectedResponse &&
    (coordinateLat !== null && coordinateLng !== null
      ? selectedResponse.location.lat === coordinateLat &&
        selectedResponse.location.lng === coordinateLng
      : selectedResponse.location.label === (committedLocationLabel.trim() || defaultLocation.label));
  const isLocationCommitted =
    Boolean(committedCoordinates) &&
    !hasLocationInputChanged &&
    locationLabel.trim() === committedLocationLabel.trim();

  const visibleLocation = useMemo(
    () => ({
      label:
        (selectedResponseMatchesCommittedLocation
          ? selectedResponse?.location.label
          : committedLocationLabel) || defaultLocation.label,
      lat:
        (selectedResponseMatchesCommittedLocation
          ? selectedResponse?.location.lat
          : coordinateLat) ?? defaultLocation.lat,
      lng:
        (selectedResponseMatchesCommittedLocation
          ? selectedResponse?.location.lng
          : coordinateLng) ?? defaultLocation.lng,
    }),
    [
      committedLocationLabel,
      coordinateLat,
      coordinateLng,
      selectedResponse?.location.label,
      selectedResponse?.location.lat,
      selectedResponse?.location.lng,
      selectedResponseMatchesCommittedLocation,
    ],
  );
  const selectedBook = selectedResponse?.resolvedBook ?? null;
  const selectedBookKey = pendingBookIsbn ?? activeBookIsbn;
  const libraryResults = selectedResponse?.results ?? [];

  useEffect(() => {
    committedLocationLabelRef.current = committedLocationLabel;
  }, [committedLocationLabel]);

  useEffect(() => {
    hasLocationInputChangedRef.current = hasLocationInputChanged;
  }, [hasLocationInputChanged]);

  useEffect(() => {
    if (!selectedResponse?.resolvedBook || selectedResponse.results.length === 0) {
      setSelectedLibraryId(null);
      return;
    }

    // A new search response should always snap back to the latest recommended library.
    setSelectedLibraryId(selectedResponse.results[0]?.library.id ?? null);
  }, [selectedResponse]);

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
        setCommittedLocationLabel(savedLocation.label);
        setCommittedLocationDetail(typeof savedLocation.detail === "string" ? savedLocation.detail : "");
        setCommittedCoordinates({
          lat: savedLocation.lat,
          lng: savedLocation.lng,
        });
        setHasLocationInputChanged(false);
      }
    } catch {
      // Ignore storage parsing failures and continue with the default location.
    }
  }, [canHydrateSavedLocation]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !committedCoordinates ||
      !committedLocationLabel.trim() ||
      committedLocationLabel.includes("확인 중")
    ) {
      return;
    }

    window.localStorage.setItem(
      SAVED_LOCATION_KEY,
      JSON.stringify({
        label: committedLocationLabel.trim(),
        detail: committedLocationDetail.trim(),
        lat: committedCoordinates.lat,
        lng: committedCoordinates.lng,
      }),
    );
  }, [committedCoordinates, committedLocationDetail, committedLocationLabel]);

  function applyLocationSuggestion(suggestion: LocationSuggestion) {
    setLocationLabel(suggestion.label);
    setCommittedLocationLabel(suggestion.label);
    setCommittedLocationDetail(suggestion.detail ?? "");
    setCommittedCoordinates({
      lat: suggestion.lat,
      lng: suggestion.lng,
    });
    setHasLocationInputChanged(false);
    setLocationSuggestions([]);
    setIsLocationSuggestionOpen(false);
    setHighlightedLocationIndex(0);
  }

  function clearSelectedBookState() {
    setActiveBookIsbn(null);
    setPendingBookIsbn(null);
    setSelectedResponse(null);
    setSelectedLibraryId(null);
  }

  useEffect(() => {
    const trimmed = locationLabel.trim();

    if (!hasLocationInputChanged || trimmed.length < 2) {
      setLocationSuggestions([]);
      setIsLocationSuggestionOpen(false);
      setIsLocationSuggestionLoading(false);
      setHighlightedLocationIndex(0);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLocationSuggestionLoading(true);

      try {
        const apiResponse = await fetch(
          `/api/location-suggestions?query=${encodeURIComponent(trimmed)}${
            Number.isFinite(visibleLocation.lat) && Number.isFinite(visibleLocation.lng)
              ? `&lat=${visibleLocation.lat}&lng=${visibleLocation.lng}`
              : ""
          }`,
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
        setIsLocationSuggestionOpen(nextSuggestions.length > 0);
        setHighlightedLocationIndex(0);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(error);
        setLocationSuggestions([]);
        setIsLocationSuggestionOpen(false);
      } finally {
        if (!controller.signal.aborted) {
          setIsLocationSuggestionLoading(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [hasLocationInputChanged, locationLabel, visibleLocation.lat, visibleLocation.lng]);

  useEffect(() => {
    if (!isLocationCommitted) {
      setIsBookSuggestionLoading(false);
      setIsBookSuggestionOpen(false);
      setHighlightedBookIndex(0);
      return;
    }

    if (!canSearchBooks(query)) {
      setBookSuggestions([]);
      setIsBookSuggestionOpen(false);
      setHighlightedBookIndex(0);
      syncUrlWithParams(
        buildSearchParams({
          query: "",
          locationLabel: committedLocationLabel,
          coordinateLat,
          coordinateLng,
        }),
      );
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsBookSuggestionLoading(true);

      try {
        const payload = await requestSearchResponse(
          {
            query,
            locationLabel: committedLocationLabel,
            coordinateLat,
            coordinateLng,
          },
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setBookSuggestions(payload.books);
        setIsBookSuggestionOpen(payload.books.length > 0);
        setHighlightedBookIndex(0);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(error);
        setBookSuggestions([]);
        setIsBookSuggestionOpen(false);
      } finally {
        if (!controller.signal.aborted) {
          setIsBookSuggestionLoading(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [committedLocationLabel, coordinateLat, coordinateLng, isLocationCommitted, query]);

  useEffect(() => {
    if (!isLocationCommitted) {
      return;
    }

    if (!activeBookIsbn) {
      return;
    }

    const responseMatchesLocation =
      selectedResponse?.resolvedBook?.isbn13 === activeBookIsbn &&
      (coordinateLat !== null && coordinateLng !== null
        ? selectedResponse.location.lat === coordinateLat &&
          selectedResponse.location.lng === coordinateLng
        : selectedResponse.location.label === (committedLocationLabel.trim() || defaultLocation.label));

    if (responseMatchesLocation) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const payload = await requestSearchResponse({
          query,
          locationLabel: committedLocationLabel,
          coordinateLat,
          coordinateLng,
          selectedIsbn: activeBookIsbn,
        });

        if (!cancelled) {
          setSelectedResponse(payload);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeBookIsbn,
    committedLocationLabel,
    coordinateLat,
    coordinateLng,
    isLocationCommitted,
    query,
    selectedResponse,
  ]);

  async function selectBook(book: BookCandidate) {
    if (!isLocationCommitted) {
      return;
    }

    setPendingBookIsbn(book.isbn13);
    setIsBookSuggestionLoading(true);
    setIsBookSuggestionOpen(false);

    try {
      const payload = await requestSearchResponse({
        query,
        locationLabel: committedLocationLabel,
        coordinateLat,
        coordinateLng,
        selectedIsbn: book.isbn13,
      });
      setSelectedResponse(payload);
      setBookSuggestions(payload.books);
      setActiveBookIsbn(payload.resolvedBook?.isbn13 ?? book.isbn13);
    } catch (error) {
      console.error(error);
      setActiveBookIsbn(null);
      setSelectedResponse(null);
    } finally {
      setPendingBookIsbn(null);
      setIsBookSuggestionLoading(false);
    }
  }

  function handleLocationInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!locationSuggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsLocationSuggestionOpen(true);
      setHighlightedLocationIndex((current) => (current + 1) % locationSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsLocationSuggestionOpen(true);
      setHighlightedLocationIndex((current) =>
        current === 0 ? locationSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && isLocationSuggestionOpen) {
      event.preventDefault();
      applyLocationSuggestion(
        locationSuggestions[highlightedLocationIndex] ?? locationSuggestions[0],
      );
      return;
    }

    if (event.key === "Escape") {
      setIsLocationSuggestionOpen(false);
      setLocationLabel(committedLocationLabel);
      setHasLocationInputChanged(false);
    }
  }

  function handleQueryInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!bookSuggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsBookSuggestionOpen(true);
      setHighlightedBookIndex((current) => (current + 1) % bookSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsBookSuggestionOpen(true);
      setHighlightedBookIndex((current) =>
        current === 0 ? bookSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && isBookSuggestionOpen) {
      event.preventDefault();
      void selectBook(bookSuggestions[highlightedBookIndex] ?? bookSuggestions[0]);
      return;
    }

    if (event.key === "Escape") {
      setIsBookSuggestionOpen(false);
    }
  }

  return (
    <section className="workspace-grid">
      <div className="control-panel compact-control-panel minimal-control-panel">
        <div className="panel-header compact-panel-header">
          <p className="panel-kicker">BOOKMAP</p>
        </div>

        <div className="field-block">
          <label htmlFor="location-input">나의 위치</label>
          <div className="location-input-wrap">
            <input
              id="location-input"
              className="text-input"
              value={locationLabel}
              onChange={(event) => {
                setLocationLabel(event.target.value);
                setHasLocationInputChanged(true);
                setIsLocationSuggestionOpen(true);
              }}
              onFocus={() => {
                if (locationSuggestions.length > 0) {
                  setIsLocationSuggestionOpen(true);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setIsLocationSuggestionOpen(false);
                  if (hasLocationInputChangedRef.current) {
                    setLocationLabel(committedLocationLabelRef.current);
                    setHasLocationInputChanged(false);
                  }
                }, 120);
              }}
              onKeyDown={handleLocationInputKeyDown}
              placeholder="주소, 건물명, 상호명"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={locationSuggestionListId}
              aria-haspopup="listbox"
              aria-expanded={isLocationSuggestionOpen}
              aria-activedescendant={
                isLocationSuggestionOpen && locationSuggestions[highlightedLocationIndex]
                  ? `${locationSuggestionListId}-${highlightedLocationIndex}`
                  : undefined
              }
            />
            {isLocationSuggestionOpen && locationSuggestions.length > 0 ? (
              <div className="location-suggestion-panel" id={locationSuggestionListId} role="listbox">
                {locationSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
                    id={`${locationSuggestionListId}-${index}`}
                    className={`location-suggestion-button ${
                      index === highlightedLocationIndex ? "is-active" : ""
                    }`}
                    type="button"
                    role="option"
                    aria-selected={index === highlightedLocationIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedLocationIndex(index)}
                    onClick={() => applyLocationSuggestion(suggestion)}
                  >
                    <div className="location-suggestion-top">
                      <strong>{suggestion.label}</strong>
                      <span className={`location-suggestion-kind is-${suggestion.kind ?? "address"}`}>
                        {getLocationSuggestionBadge(suggestion)}
                      </span>
                    </div>
                    {suggestion.detail ? <span>{suggestion.detail}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {isLocationSuggestionLoading ? <div className="inline-loading">위치 찾는 중...</div> : null}
        </div>

        <div className="field-block">
          <label htmlFor="query-input">찾고 싶은 책</label>
          <div className="book-input-wrap">
            <input
              id="query-input"
              className="text-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsBookSuggestionOpen(true);
                clearSelectedBookState();
              }}
              onFocus={() => {
                if (bookSuggestions.length > 0) {
                  setIsBookSuggestionOpen(true);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setIsBookSuggestionOpen(false);
                }, 120);
              }}
              onKeyDown={handleQueryInputKeyDown}
              placeholder="제목, 저자, ISBN"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={bookSuggestionListId}
              aria-haspopup="listbox"
              aria-expanded={isBookSuggestionOpen}
              aria-activedescendant={
                isBookSuggestionOpen && bookSuggestions[highlightedBookIndex]
                  ? `${bookSuggestionListId}-${highlightedBookIndex}`
                  : undefined
              }
            />
            {isBookSuggestionOpen && bookSuggestions.length > 0 ? (
              <div className="book-suggestion-panel" id={bookSuggestionListId} role="listbox">
                {bookSuggestions.map((book, index) => {
                  const isSelected = selectedBookKey === book.isbn13;

                  return (
                    <button
                      key={book.isbn13}
                      id={`${bookSuggestionListId}-${index}`}
                      className={`book-suggestion-button ${
                        index === highlightedBookIndex ? "is-active" : ""
                      } ${isSelected ? "is-selected" : ""}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlightedBookIndex(index)}
                      onClick={() => void selectBook(book)}
                    >
                      <strong>{book.title}</strong>
                      <span className="book-suggestion-meta">
                        {book.author || "저자 정보 없음"}
                        {book.publisher ? ` · ${book.publisher}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {isBookSuggestionLoading ? <div className="inline-loading">도서 찾는 중...</div> : null}
        </div>

        {selectedBook ? (
          <section className="selection-section selected-book-card">
            <div className="selection-section-head">
              <div>
                <p className="selection-kicker">선택한 도서</p>
                <strong>{selectedBook.title}</strong>
              </div>
              <span className="selection-count">{getSourceLabel(selectedResponse?.source ?? null)}</span>
            </div>
            <div className="selected-book-layout">
              <BookCoverImage book={selectedBook} className="selected-book-cover" />
              <div className="selected-book-copy">
                <p className="selected-book-meta">
                  {selectedBook.author || "저자 정보 없음"}
                  {selectedBook.publisher ? ` · ${selectedBook.publisher}` : ""}
                </p>
                <p className="selected-book-meta">ISBN {selectedBook.isbn13}</p>
                {selectedBook.synopsis ? <p>{selectedBook.synopsis}</p> : null}
                {selectedBook.tags.length > 0 ? (
                  <div className="book-tag-row">
                    {selectedBook.tags.map((tag) => (
                      <span key={tag} className="book-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {libraryResults.length > 0 ? (
          <section className="selection-section library-candidate-section">
            <p className="selection-kicker">가까운 도서관</p>
            <div className="library-candidate-list">
              {libraryResults.map((result) => (
                <LibraryCandidateCard
                  key={result.library.id}
                  result={result}
                  userLocation={visibleLocation}
                  isSelected={selectedLibraryId === result.library.id}
                  onSelect={setSelectedLibraryId}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="panel-card map-panel">
        <LibraryMap
          userLocation={visibleLocation}
          results={selectedResponse?.results ?? []}
          selectedLibraryId={selectedLibraryId}
          onSelectLibrary={setSelectedLibraryId}
        />
      </div>
    </section>
  );
}
