import { NextRequest, NextResponse } from "next/server";
import { LocationResolutionError } from "@/lib/location";
import { searchBookmap } from "@/lib/search";

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
    if (error instanceof LocationResolutionError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: error.code === "location_required" ? 400 : 404,
        },
      );
    }

    console.error("GET /api/search failed", error);

    return NextResponse.json(
      {
        error: "검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      },
      {
        status: 502,
      },
    );
  }
}
