"use client";

import { useMemo, useState } from "react";
import { BookCandidate } from "@/lib/types";

type BookCoverImageProps = {
  book: BookCandidate;
  className?: string;
};

function getFallbackCoverUrl(isbn13: string) {
  const trimmed = isbn13.trim();

  if (!trimmed) {
    return "";
  }

  return `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/${trimmed}.jpg`;
}

export function BookCoverImage({ book, className }: BookCoverImageProps) {
  const [hasError, setHasError] = useState(false);
  const coverUrl = useMemo(() => {
    if (book.coverUrl?.trim()) {
      return book.coverUrl.trim();
    }

    return getFallbackCoverUrl(book.isbn13);
  }, [book.coverUrl, book.isbn13]);
  const initials = (book.title.trim()[0] ?? "책").toUpperCase();

  if (!coverUrl || hasError) {
    return (
      <div className={className} aria-hidden="true">
        <div className="book-cover-fallback">{initials}</div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="book-cover-image"
        src={coverUrl}
        alt={`${book.title} 표지`}
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
