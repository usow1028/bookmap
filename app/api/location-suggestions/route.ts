import { NextRequest, NextResponse } from "next/server";
import { suggestLocations } from "@/lib/location";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({
      suggestions: [],
    });
  }

  try {
    const suggestions = await suggestLocations(query);

    return NextResponse.json({
      suggestions,
    });
  } catch {
    return NextResponse.json({
      suggestions: [],
    });
  }
}
