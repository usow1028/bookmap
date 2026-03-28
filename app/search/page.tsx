import { redirect } from "next/navigation";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();
  const query = readString(params.q);
  const isbn = readString(params.isbn);
  const location = readString(params.location);
  const lat = readString(params.lat);
  const lng = readString(params.lng);

  if (query) {
    nextParams.set("q", query);
  }

  if (isbn) {
    nextParams.set("isbn", isbn);
  }

  if (location) {
    nextParams.set("location", location);
  }

  if (lat) {
    nextParams.set("lat", lat);
  }

  if (lng) {
    nextParams.set("lng", lng);
  }

  redirect(nextParams.size > 0 ? `/?${nextParams.toString()}` : "/");
}
