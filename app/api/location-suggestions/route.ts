import { NextRequest, NextResponse } from "next/server";
import { suggestLocations } from "@/lib/location";

function readNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const lat = readNumber(request.nextUrl.searchParams.get("lat"));
  const lng = readNumber(request.nextUrl.searchParams.get("lng"));

  if (query.length < 2) {
    return NextResponse.json({
      suggestions: [],
    });
  }

  try {
    const suggestions = await suggestLocations(
      query,
      5,
      typeof lat === "number" && typeof lng === "number" ? { lat, lng } : undefined,
    );

    return NextResponse.json({
      suggestions,
    });
  } catch {
    return NextResponse.json({
      suggestions: [],
    });
  }
}
