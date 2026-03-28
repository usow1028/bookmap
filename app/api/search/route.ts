import { NextRequest, NextResponse } from "next/server";
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
  const label = searchParams.get("location") ?? "";
  const lat = readNumber(searchParams.get("lat"));
  const lng = readNumber(searchParams.get("lng"));

  const response = await searchBookmap(query, {
    label,
    lat,
    lng,
  });

  return NextResponse.json(response);
}
