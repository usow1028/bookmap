import { NextRequest, NextResponse } from "next/server";
import { reverseLookupLocationLabel } from "@/lib/location";

function readNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const lat = readNumber(request.nextUrl.searchParams.get("lat"));
  const lng = readNumber(request.nextUrl.searchParams.get("lng"));

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      {
        location: null,
      },
      {
        status: 400,
      },
    );
  }

  const location = await reverseLookupLocationLabel({
    label: "현재 위치",
    lat,
    lng,
  });

  return NextResponse.json({
    location,
  });
}
