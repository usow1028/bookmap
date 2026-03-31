import type { BookCandidate } from "@/lib/types";

const LIBRARY_HOMEPAGE_SEARCH_LAUNCH_PATH = "/library-homepage-search";

function normalizeHomepageUrl(homepage: string) {
  const trimmed = homepage.trim();

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function buildLibraryHomepageSearchLaunchUrl(homepage: string, book: BookCandidate | null) {
  const normalizedHomepage = normalizeHomepageUrl(homepage);

  if (!normalizedHomepage) {
    return "";
  }

  const params = new URLSearchParams({
    homepage: normalizedHomepage,
  });

  if (book?.title.trim()) {
    params.set("title", book.title.trim());
  }

  if (book?.isbn13.trim()) {
    params.set("isbn", book.isbn13.trim());
  }

  return `${LIBRARY_HOMEPAGE_SEARCH_LAUNCH_PATH}?${params.toString()}`;
}

export function openLibraryHomepageSearch(homepage: string, book: BookCandidate | null) {
  if (typeof window === "undefined") {
    return;
  }

  const launchUrl = buildLibraryHomepageSearchLaunchUrl(homepage, book);

  if (!launchUrl) {
    return;
  }

  window.open(launchUrl, "_blank", "noopener,noreferrer");
}
