import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDistanceKm } from "@/lib/geo";
import { resolveUserLocation } from "@/lib/location";
import { geocodeWithNaver } from "@/lib/naver-maps";

type SiteBook = {
  seq: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  sourceQuery: string;
};

type BookPageSession = {
  detailUrl: string;
  csrf: string;
  cookieHeader: string;
};

type OwnLibRow = {
  lib_name: string;
  addr: string;
  tel?: string;
  homepage?: string;
};

type DisplayedLibrary = OwnLibRow & {
  lat: number;
  lng: number;
  distanceKm: number;
};

type HomepageBranchEntry = {
  libraryName: string;
  normalizedLibraryName: string;
  statusText: string;
  roomText: string;
  reservationText: string;
  queryVariant: string;
};

type BookEvaluation = {
  book: SiteBook;
  displayedLibraries: DisplayedLibrary[];
  homepageBranches: HomepageBranchEntry[];
  matchedDisplayedBranches: string[];
  missingOnHomepage: string[];
  extraOnHomepage: string[];
  exactBranchSetMatch: boolean;
  nearestDisplayedSummary: string[];
};

const TARGET_BOOK_COUNT = 50;
const TARGET_AREA_CODE = "11190";
const TARGET_AREA_NAME = "영등포구";
const TARGET_LIBRARY_DOMAIN = "ydplib.or.kr";
const DATA4LIBRARY_SEARCH_URL = "https://www.data4library.kr/srch";
const DATA4LIBRARY_BOOK_URL = "https://www.data4library.kr/bookV";
const DATA4LIBRARY_OWN_LIB_URL = "https://www.data4library.kr/bookOwnLibJson";
const YDPL_SEARCH_URL = "https://www.ydplib.or.kr/intro/plusSearchResultList.do";
const REPORT_DATE = new Date().toISOString().slice(0, 10);
const REQUEST_TIMEOUT_MS = 15000;

const SEARCH_SEEDS = [
  "소설",
  "에세이",
  "경제",
  "과학",
  "심리",
  "역사",
  "철학",
  "자기계발",
  "인문",
  "사회",
  "아동",
  "그림책",
  "동화",
  "만화",
  "고전",
  "한국사",
  "세계사",
  "예술",
  "건강",
  "여행",
  "요리",
  "영어",
  "수학",
  "컴퓨터",
  "추리",
  "판타지",
  "사랑",
  "성장",
  "투자",
  "부동산",
  "교육",
  "육아",
  "환경",
  "정치",
  "미래",
  "고양이",
  "바다",
  "우주",
];

const geocodeCache = new Map<string, Promise<{ lat: number; lng: number } | null>>();
const bookPageSessionCache = new Map<string, Promise<BookPageSession>>();

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string) {
  return value
    .replace(/\s*[:：].*$/, "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLibraryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[()[\]{}'"`.,:;!?/\\|_-]+/g, "")
    .replace(/\s+/g, "");
}

function extractFirstMatch(source: string, pattern: RegExp) {
  const matched = pattern.exec(source);
  return matched?.[1] ? stripHtml(matched[1]) : "";
}

function withTimeout<T>(promise: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

async function fetchHtml(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  return {
    response,
    html: await response.text(),
  };
}

async function searchSiteBooks(query: string) {
  const url = new URL(DATA4LIBRARY_SEARCH_URL);
  url.searchParams.set("srchText", query);
  const { html } = await fetchHtml(url.toString());
  const blocks = html.match(/<div class="list_col">[\s\S]*?<div class="l_c_number">/g) ?? [];

  return blocks
    .map((block) => {
      const seq = extractFirstMatch(block, /detailBookV\('(\d+)'\)/);
      const isbn13 = extractFirstMatch(block, /<span class="l_c_issn">[\s\S]*?ISBN<\/em>\s*([^<]+)<\/span>/);
      const title = extractFirstMatch(block, /class="l_c_tit">([\s\S]*?)<\/a>/);
      const author = extractFirstMatch(block, /<li><span>지은이<\/span>\s*([\s\S]*?)<\/li>/);
      const publisher = extractFirstMatch(block, /<li><span>출판사<\/span>\s*([\s\S]*?)<\/li>/);

      if (!seq || !isbn13 || !title) {
        return null;
      }

      return {
        seq,
        isbn13,
        title,
        author,
        publisher,
        sourceQuery: query,
      } satisfies SiteBook;
    })
    .filter((book): book is SiteBook => book !== null);
}

async function getBookPageSession(seq: string) {
  const cached = bookPageSessionCache.get(seq);

  if (cached) {
    return cached;
  }

  const sessionPromise = (async () => {
    const detailUrl = `${DATA4LIBRARY_BOOK_URL}?seq=${encodeURIComponent(seq)}`;
    const response = await fetch(detailUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const html = await response.text();
    const cookieHeader = (response.headers.getSetCookie?.() ?? [])
      .map((line) => line.split(";")[0]?.trim())
      .filter(Boolean)
      .join("; ");
    const csrf =
      html.match(/window\._csrf\s*=\s*\{[\s\S]*?token:\s*'([^']+)'/)?.[1]
      ?? html.match(/name="_csrf" value="([^"]+)"/)?.[1]
      ?? "";

    if (!cookieHeader || !csrf) {
      throw new Error(`Failed to initialize data4library session for seq=${seq}`);
    }

    return {
      detailUrl,
      csrf,
      cookieHeader,
    } satisfies BookPageSession;
  })();

  bookPageSessionCache.set(seq, sessionPromise);
  return sessionPromise;
}

async function fetchDisplayedLibraries(seq: string) {
  const session = await getBookPageSession(seq);
  const body = new URLSearchParams({
    areacode: TARGET_AREA_CODE,
    seq,
    _csrf: session.csrf,
  });

  const response = await fetch(DATA4LIBRARY_OWN_LIB_URL, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "x-csrf-token": session.csrf,
      cookie: session.cookieHeader,
      referer: session.detailUrl,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`bookOwnLibJson failed: ${response.status}`);
  }

  const rows = (await response.json()) as OwnLibRow[];
  return rows.filter((row) => (row.homepage ?? "").includes(TARGET_LIBRARY_DOMAIN));
}

async function geocodeAddress(address: string) {
  const normalized = address.trim();

  if (!normalized) {
    return null;
  }

  const cached = geocodeCache.get(normalized);

  if (cached) {
    return cached;
  }

  const geocodePromise = withTimeout(geocodeWithNaver(normalized), `geocode ${normalized}`)
    .then((result) => (result ? { lat: result.lat, lng: result.lng } : null))
    .catch(() => null);

  geocodeCache.set(normalized, geocodePromise);
  return geocodePromise;
}

async function resolveDisplayedLibraries(seq: string, origin: { lat: number; lng: number }) {
  const rows = await fetchDisplayedLibraries(seq);
  const libraries = (
    await Promise.all(
      rows.map(async (row) => {
        const point = await geocodeAddress(row.addr);

        if (!point) {
          return null;
        }

        return {
          ...row,
          lat: point.lat,
          lng: point.lng,
          distanceKm: getDistanceKm(origin, point),
        } satisfies DisplayedLibrary;
      }),
    )
  )
    .filter((row): row is DisplayedLibrary => row !== null)
    .sort((left, right) => left.distanceKm - right.distanceKm);

  return libraries;
}

function parseYdplibSearchEntries(html: string, targetIsbn: string, queryVariant: string) {
  const blocks = html.split(/<li>/i);
  const entries: HomepageBranchEntry[] = [];

  for (const block of blocks) {
    if (!block.includes("bookDataWrap") || !block.includes("ISBN:") || !block.includes("도서관:")) {
      continue;
    }

    const isbn = extractFirstMatch(block, /ISBN:\s*([^<]+)/);

    if (isbn !== targetIsbn) {
      continue;
    }

    const libraryName = extractFirstMatch(block, /도서관:\s*([\s\S]*?)<\/span>/);
    const statusText = extractFirstMatch(block, /<b class="[^"]+">\s*([\s\S]*?)<\/b>/);
    const roomText = extractFirstMatch(block, /자료실:\s*([\s\S]*?)<\/span>/);
    const reservationCount = extractFirstMatch(block, /\(예약:\s*([^<]+)\)/);
    const reservationText = block.includes("도서예약신청")
      ? "도서예약신청"
      : block.includes("도서예약불가")
        ? "도서예약불가"
        : reservationCount
          ? `예약 ${reservationCount}`
          : "";

    if (!libraryName) {
      continue;
    }

    entries.push({
      libraryName,
      normalizedLibraryName: normalizeLibraryName(libraryName),
      statusText,
      roomText,
      reservationText,
      queryVariant,
    });
  }

  const deduped = new Map<string, HomepageBranchEntry>();

  for (const entry of entries) {
    deduped.set(entry.normalizedLibraryName, entry);
  }

  return Array.from(deduped.values());
}

async function searchYdplibHomepage(book: SiteBook) {
  const queryVariants = Array.from(
    new Set([
      normalizeTitle(book.title),
      book.title.trim(),
      book.isbn13.trim(),
    ].filter(Boolean)),
  );

  for (const queryVariant of queryVariants) {
    const body = new URLSearchParams({
      searchType: "SIMPLE",
      searchCategory: "ALL",
      searchKey: "ALL",
      searchLibrary: "ALL",
      searchKeyword: queryVariant,
    });

    const { html } = await fetchHtml(YDPL_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body.toString(),
    });
    const entries = parseYdplibSearchEntries(html, book.isbn13, queryVariant);

    if (entries.length > 0) {
      return entries;
    }
  }

  return [] as HomepageBranchEntry[];
}

function buildNearestDisplayedSummary(
  displayedLibraries: DisplayedLibrary[],
  homepageBranches: HomepageBranchEntry[],
) {
  const homepageMap = new Map(
    homepageBranches.map((branch) => [branch.normalizedLibraryName, branch]),
  );

  return displayedLibraries.slice(0, 3).map((library) => {
    const matched = homepageMap.get(normalizeLibraryName(library.lib_name));
    const status = matched?.statusText || "홈페이지 미확인";
    const reservation = matched?.reservationText ? ` / ${matched.reservationText}` : "";

    return `${library.lib_name} ${library.distanceKm.toFixed(2)}km: ${status}${reservation}`;
  });
}

async function evaluateBook(
  book: SiteBook,
  origin: { lat: number; lng: number },
) {
  const displayedLibraries = await resolveDisplayedLibraries(book.seq, origin);

  if (displayedLibraries.length === 0) {
    return null;
  }

  const homepageBranches = await searchYdplibHomepage(book);
  const displayedSet = new Set(displayedLibraries.map((library) => normalizeLibraryName(library.lib_name)));
  const homepageSet = new Set(homepageBranches.map((branch) => branch.normalizedLibraryName));
  const matchedDisplayedBranches = Array.from(displayedSet).filter((name) => homepageSet.has(name));
  const missingOnHomepage = displayedLibraries
    .map((library) => library.lib_name)
    .filter((name) => !homepageSet.has(normalizeLibraryName(name)));
  const extraOnHomepage = homepageBranches
    .map((branch) => branch.libraryName)
    .filter((name) => !displayedSet.has(normalizeLibraryName(name)));
  const exactBranchSetMatch =
    displayedSet.size === homepageSet.size &&
    Array.from(displayedSet).every((name) => homepageSet.has(name));

  return {
    book,
    displayedLibraries,
    homepageBranches,
    matchedDisplayedBranches,
    missingOnHomepage,
    extraOnHomepage,
    exactBranchSetMatch,
    nearestDisplayedSummary: buildNearestDisplayedSummary(displayedLibraries, homepageBranches),
  } satisfies BookEvaluation;
}

function pickRepresentativeBooks(books: SiteBook[]) {
  const seen = new Set<string>();
  const selected: SiteBook[] = [];

  for (const book of books) {
    if (seen.has(book.isbn13)) {
      continue;
    }

    seen.add(book.isbn13);
    selected.push(book);
  }

  return selected;
}

function buildMarkdownReport(params: {
  locationLabel: string;
  locationPoint: { lat: number; lng: number };
  evaluations: BookEvaluation[];
  branchPrecision: number;
  branchRecall: number;
  exactBookMatchRate: number;
}) {
  const lines: string[] = [];
  const totalDisplayedBranches = params.evaluations.reduce(
    (sum, evaluation) => sum + evaluation.displayedLibraries.length,
    0,
  );
  const totalHomepageBranches = params.evaluations.reduce(
    (sum, evaluation) => sum + evaluation.homepageBranches.length,
    0,
  );

  lines.push(`# YDPL Accuracy Report (${REPORT_DATE})`);
  lines.push("");
  lines.push(`- 위치: ${params.locationLabel} (${params.locationPoint.lat.toFixed(6)}, ${params.locationPoint.lng.toFixed(6)})`);
  lines.push(`- 평가 범위: ${TARGET_AREA_NAME} / ${TARGET_LIBRARY_DOMAIN}`);
  lines.push(`- 표본 도서 수: ${params.evaluations.length}`);
  lines.push(`- 표시 분관 수 합계: ${totalDisplayedBranches}`);
  lines.push(`- 홈페이지 분관 수 합계: ${totalHomepageBranches}`);
  lines.push(`- 분관 기준 precision: ${(params.branchPrecision * 100).toFixed(2)}%`);
  lines.push(`- 분관 기준 recall: ${(params.branchRecall * 100).toFixed(2)}%`);
  lines.push(`- 도서 기준 exact match: ${(params.exactBookMatchRate * 100).toFixed(2)}%`);
  lines.push("");
  lines.push("| # | 도서 | ISBN | 표시 분관 | 홈페이지 분관 | 일치 분관 | Exact | 최근접 분관 상태 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");

  params.evaluations.forEach((evaluation, index) => {
    lines.push(
      `| ${index + 1} | ${evaluation.book.title.replace(/\|/g, "\\|")} | ${evaluation.book.isbn13} | ${evaluation.displayedLibraries.length} | ${evaluation.homepageBranches.length} | ${evaluation.matchedDisplayedBranches.length} | ${evaluation.exactBranchSetMatch ? "Y" : "N"} | ${(evaluation.nearestDisplayedSummary[0] ?? "-").replace(/\|/g, "\\|")} |`,
    );
  });

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- 표시 결과는 `data4library.kr` 공개 상세페이지의 `bookOwnLibJson` 영등포구 응답을 사용했습니다.");
  lines.push("- 실제 정보는 영등포구립도서관 검색 결과 HTML에서 같은 ISBN의 분관별 상태 문구를 직접 파싱했습니다.");
  lines.push("- 정보나루 Open API `libSrchByBook`는 이 실행 시점에 IP 등록 오류로 차단되어, 앱의 원래 라이브 경로 대신 공개 웹 경로를 사용했습니다.");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const location = await resolveUserLocation({
    label: "대림동1차한신아파트",
  });

  const candidateBooks: SiteBook[] = [];

  for (const query of SEARCH_SEEDS) {
    const found = await searchSiteBooks(query);
    candidateBooks.push(...found);
  }

  const uniqueBooks = pickRepresentativeBooks(candidateBooks);
  const evaluations: BookEvaluation[] = [];

  for (const book of uniqueBooks) {
    if (evaluations.length >= TARGET_BOOK_COUNT) {
      break;
    }

    try {
      const evaluation = await evaluateBook(book, location);

      if (evaluation) {
        evaluations.push(evaluation);
        console.error(
          `[${evaluations.length}/${TARGET_BOOK_COUNT}] ${book.title} (${book.isbn13}) displayed=${evaluation.displayedLibraries.length} homepage=${evaluation.homepageBranches.length} exact=${evaluation.exactBranchSetMatch ? "Y" : "N"}`,
        );
      }
    } catch (error) {
      console.error(`Failed to evaluate ${book.title} (${book.isbn13})`, error);
    }
  }

  if (evaluations.length < TARGET_BOOK_COUNT) {
    throw new Error(`Expected ${TARGET_BOOK_COUNT} books, collected ${evaluations.length}`);
  }

  const totalDisplayedBranches = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.displayedLibraries.length,
    0,
  );
  const totalHomepageBranches = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.homepageBranches.length,
    0,
  );
  const matchedBranches = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.matchedDisplayedBranches.length,
    0,
  );
  const exactBookMatches = evaluations.filter((evaluation) => evaluation.exactBranchSetMatch).length;
  const branchPrecision = totalDisplayedBranches === 0 ? 0 : matchedBranches / totalDisplayedBranches;
  const branchRecall = totalHomepageBranches === 0 ? 0 : matchedBranches / totalHomepageBranches;
  const exactBookMatchRate = evaluations.length === 0 ? 0 : exactBookMatches / evaluations.length;

  const outputDir = join(process.cwd(), "reports");
  mkdirSync(outputDir, { recursive: true });

  const summary = {
    location,
    targetAreaCode: TARGET_AREA_CODE,
    targetAreaName: TARGET_AREA_NAME,
    targetLibraryDomain: TARGET_LIBRARY_DOMAIN,
    sampleCount: evaluations.length,
    totalDisplayedBranches,
    totalHomepageBranches,
    matchedBranches,
    branchPrecision,
    branchRecall,
    exactBookMatches,
    exactBookMatchRate,
    evaluations,
  };

  const jsonPath = join(outputDir, `ydplib-accuracy-${REPORT_DATE}.json`);
  const markdownPath = join(outputDir, `ydplib-accuracy-${REPORT_DATE}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(
    markdownPath,
    buildMarkdownReport({
      locationLabel: location.label,
      locationPoint: location,
      evaluations,
      branchPrecision,
      branchRecall,
      exactBookMatchRate,
    }),
    "utf8",
  );

  console.log(JSON.stringify({
    jsonPath,
    markdownPath,
    sampleCount: evaluations.length,
    branchPrecision,
    branchRecall,
    exactBookMatchRate,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
