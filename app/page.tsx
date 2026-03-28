import { searchBookmap } from "@/lib/search";
import { BookmapWorkspace } from "@/components/BookmapWorkspace";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function readNumber(value: string | string[] | undefined) {
  const candidate = readString(value);

  if (!candidate) {
    return undefined;
  }

  const parsed = Number(candidate);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const initialQuery = readString(params.q);
  const initialIsbn = readString(params.isbn);
  const initialLocationLabel = readString(params.location, "서울 성수동");
  const initialLat = readNumber(params.lat);
  const initialLng = readNumber(params.lng);
  const initialResponse = initialQuery
    ? await searchBookmap(initialQuery, {
        label: initialLocationLabel,
        lat: initialLat,
        lng: initialLng,
      }, initialIsbn || undefined)
    : null;

  return (
    <main className="page-shell single-workspace-page">
      <BookmapWorkspace
        initialQuery={initialQuery}
        initialLocationLabel={initialLocationLabel}
        initialLat={initialLat}
        initialLng={initialLng}
        initialResponse={initialResponse}
      />
    </main>
  );
}
