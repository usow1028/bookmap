import { NextRequest, NextResponse } from "next/server";
import { defaultLocation } from "@/lib/mock-data";
import { searchBookmap } from "@/lib/search";
import { SearchResponse } from "@/lib/types";

function readNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? "";
  const isbn = searchParams.get("isbn") ?? undefined;
  const label = searchParams.get("location") ?? "";
  const lat = readNumber(searchParams.get("lat"));
  const lng = readNumber(searchParams.get("lng"));

  try {
    const response = await searchBookmap(
      query,
      {
        label,
        lat,
        lng,
      },
      isbn,
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/search failed", error);

    const fallback: SearchResponse = {
      query,
      books: [],
      resolvedBook: null,
      location: {
        label: label.trim() || defaultLocation.label,
        lat: lat ?? defaultLocation.lat,
        lng: lng ?? defaultLocation.lng,
      },
      results: [],
      warnings: ["검색 중 오류가 발생해 결과를 불러오지 못했습니다. 다시 시도해 주세요."],
      source: "mock",
    };

    return NextResponse.json(fallback);
  }
}
