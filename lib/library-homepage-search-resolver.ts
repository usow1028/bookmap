export type LibrarySearchMethod = "get" | "post";

export type LibrarySearchRequest = {
  action: string;
  method: LibrarySearchMethod;
  fields: Record<string, string>;
  source: "known" | "form" | "spa" | "fallback";
  adapterId: string;
};

export type LibraryHomepageSearchPayload = {
  homepage: string;
  title?: string;
  isbn?: string;
};

type FetchedHtmlPage = {
  html: string;
  status: number;
  url: URL;
};

type ResolverContext = {
  homepageUrl: URL;
  payload: LibraryHomepageSearchPayload;
  searchTerm: string;
  fetchPage: (target: URL) => Promise<FetchedHtmlPage>;
  getHomepagePage: () => Promise<FetchedHtmlPage>;
};

type SearchRequestAdapter = {
  id: string;
  resolve: (context: ResolverContext) => Promise<LibrarySearchRequest | null> | LibrarySearchRequest | null;
};

type KnownLibrarySearchResolver = (
  homepageUrl: URL,
  searchTerm: string,
) => LibrarySearchRequest | null;

type KeywordInputCandidate = {
  label: string;
  name: string;
  score: number;
};

type ParsedFormCandidate = {
  action: string;
  method: LibrarySearchMethod;
  fields: Record<string, string>;
  score: number;
};

const SEARCH_ACTION_HINT = /search|srch|plussearch|booksearch|searchresult|keyword/i;
const SEARCH_TEXT_HINT =
  /search|keyword|query|find|통합검색|자료검색|도서검색|검색어|searchkeyword|searchword|searchwrd|searchtxt|searchtitle|sstring/i;
const META_REFRESH_PATTERN =
  /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"';]+)[^"']*["']/i;
const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};
const FETCH_TIMEOUT_MS = 8000;
const BAD_FALLBACK_TARGET_HINT =
  /(?:^|\/)(?:login|logout)(?:[/.]|$)|requestpage|play\.google\.com|apps\.apple\.com|itunes\.apple\.com/i;

function normalizeHomepageUrl(homepage: string) {
  const trimmed = homepage.trim();

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function readPrimarySearchTerm(payload: LibraryHomepageSearchPayload) {
  const title = payload.title?.trim() ?? "";

  if (title) {
    return title;
  }

  return payload.isbn?.trim() ?? "";
}

function buildSearchRequest(
  action: string,
  method: LibrarySearchMethod,
  fields: Record<string, string>,
  source: LibrarySearchRequest["source"],
  adapterId: string,
): LibrarySearchRequest {
  return {
    action,
    method,
    fields,
    source,
    adapterId,
  };
}

function buildFallbackRequest(homepageUrl: URL) {
  return buildSearchRequest(homepageUrl.toString(), "get", {}, "fallback", "fallback:homepage");
}

function readLibraryPath(homepageUrl: URL) {
  return homepageUrl.pathname.split("/").filter(Boolean)[0] ?? "";
}

function buildGangnamLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  const libraryPath = readLibraryPath(homepageUrl);

  if (!libraryPath) {
    return null;
  }

  return buildSearchRequest(
    new URL(`/${libraryPath}/plusSearchResultList.do`, homepageUrl.origin).toString(),
    "post",
    {
      searchType: "SIMPLE",
      searchCategory: "ALL",
      searchKey: "ALL",
      searchKeyword: searchTerm,
    },
    "known",
    "known:gangnam-plussearch",
  );
}

function buildJungguLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  return buildSearchRequest(
    new URL("/SJGL/program/searchResultList.do", homepageUrl.origin).toString(),
    "post",
    {
      searchType: "SIMPLE",
      searchManageCode: "ALL",
      searchKeyword: searchTerm,
    },
    "known",
    "known:junggu-searchresult",
  );
}

function buildSeongdongLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  return buildSearchRequest(
    new URL("/main/site/search/search00.do", homepageUrl.origin).toString(),
    "get",
    {
      search_txt: searchTerm,
    },
    "known",
    "known:seongdong-site-search",
  );
}

function buildYangcheonLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  const libraryPath = readLibraryPath(homepageUrl);

  if (!libraryPath) {
    return null;
  }

  return buildSearchRequest(
    new URL(`/${libraryPath}/site/search/bookSearch.do`, homepageUrl.origin).toString(),
    "get",
    {
      manage_code: "MA",
      search_txt: searchTerm,
    },
    "known",
    "known:yangcheon-booksearch",
  );
}

function buildGwanakLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  return buildSearchRequest(
    new URL("/galib/program/searchResultList.do", homepageUrl.origin).toString(),
    "post",
    {
      searchType: "SIMPLE",
      searchKeyword: searchTerm,
    },
    "known",
    "known:gwanak-searchresult",
  );
}

function buildSeodaemunLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  return buildSearchRequest(
    new URL("/sdmlib/program/searchResultList.do", homepageUrl.origin).toString(),
    "post",
    {
      searchType: "SIMPLE",
      searchManageCode: "ALL",
      searchKeyword: searchTerm,
    },
    "known",
    "known:seodaemun-searchresult",
  );
}

function buildDongdaemunLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  return buildSearchRequest(
    new URL("/intro/plusSearchResultList.do", homepageUrl.origin).toString(),
    "post",
    {
      searchType: "SIMPLE",
      searchKeyword: searchTerm,
    },
    "known",
    "known:dongdaemun-plussearch",
  );
}

function buildMapoLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  return buildSearchRequest(
    new URL("/mcl/PGM3007/plusSearchResultList.do", homepageUrl.origin).toString(),
    "get",
    {
      searchKey: "ALL",
      searchKeyword: searchTerm,
    },
    "known",
    "known:mapo-plussearch",
  );
}

function buildSongpaLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  const libraryPath = readLibraryPath(homepageUrl);

  if (!libraryPath) {
    return null;
  }

  return buildSearchRequest(
    new URL(`/${libraryPath}/program/plusSearchResultList.do`, homepageUrl.origin).toString(),
    "post",
    {
      searchType: "SIMPLE",
      searchCategory: "BOOK",
      searchKey: "ALL",
      searchKeyword: searchTerm,
    },
    "known",
    "known:songpa-plussearch",
  );
}

function buildGimhaeLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "http://libbook.gimhae.go.kr:8000/bookv2/smartlib/list.php",
    "get",
    {
      cpage: "1",
      _es: "1",
      sstring: searchTerm,
    },
    "known",
    "known:gimhae-smartlib",
  );
}

function buildBucheonLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://alpasq.bcl.go.kr/sso/bcl",
    "get",
    {
      route: "SEARCH",
      keyword: searchTerm,
    },
    "known",
    "known:bucheon-alpasq-search",
  );
}

function buildAnseongLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "http://www.anseong.go.kr/search/front/Search.jsp",
    "post",
    {
      searchKey: "all",
      qt: searchTerm,
    },
    "known",
    "known:anseong-searchjsp",
  );
}

function buildDongjakLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "http://lib.dongjak.go.kr/dj/intro/search/index.do",
    "get",
    {
      menu_idx: "111",
      booktype: "BOOK",
      search_type: "L_TITLE",
      search_text: searchTerm,
    },
    "known",
    "known:dongjak-simple-search",
  );
}

function buildGimjeLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://gjl.gimje.go.kr/index.gimje",
    "get",
    {
      menuCd: "DOM_000000101000000000",
      book_type: "BOOK",
      search_txt: searchTerm,
    },
    "known",
    "known:gimje-index-search",
  );
}

function buildCheongjuLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://library.cheongju.go.kr/lib/front/index.php",
    "get",
    {
      g_page: "search",
      m_page: "search01",
      search: "book",
      searchWord: searchTerm,
    },
    "known",
    "known:cheongju-front-search",
  );
}

function buildUijeongbuLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://www.uilib.go.kr/main/intro/search/index.do",
    "get",
    {
      menu_idx: "9",
      booktype: "ALL",
      title: searchTerm,
    },
    "known",
    "known:uijeongbu-main-search",
  );
}

function buildDongguUlsanLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://library.donggu.ulsan.kr/main/site/search/bookSearch.do",
    "get",
    {
      cmd_name: "bookandnonbooksearch",
      search_type: "detail",
      search_item: "search_title",
      search_txt: searchTerm,
    },
    "known",
    "known:donggu-ulsan-book-search",
  );
}

function buildChungjuLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://lib.chungju.go.kr/web/program/searchResultList.do",
    "post",
    {
      searchType: "SIMPLE",
      searchCategory: "ALL",
      searchClassNo1Aggs: "ALL",
      searchField: "ALL",
      searchLibrary: "ALL",
      searchWord: searchTerm,
    },
    "known",
    "known:chungju-search-result",
  );
}

function buildGwangjuSmallLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://lib.gjcity.go.kr/slib/lay1/program/S39T420C430/jnet/resourcessearch/resultList.do",
    "get",
    {
      searchType: "SIMPLE",
      searchKey: "ALL",
      searchLibraryArr: "MD",
      searchLibraryArr2: "MF",
      searchLibraryArr3: "MG",
      searchLibraryArr4: "MI",
      searchLibraryArr5: "MK",
      searchLibraryArr6: "MS",
      searchKeyword: searchTerm,
    },
    "known",
    "known:gwangju-smalllib-search",
  );
}

function buildDangjinLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://lib.dangjin.go.kr/dls_le/index.php",
    "get",
    {
      mod: "wdDataSearch",
      act: "searchIList",
      item: "total",
      word: searchTerm,
    },
    "known",
    "known:dangjin-dls-search",
  );
}

function buildSeoguLibrarySearchRequest(homepageUrl: URL, searchTerm: string) {
  const pathSegments = homepageUrl.pathname.split("/").filter(Boolean);
  const libraryKey =
    pathSegments.find((segment) => segment !== "library" && segment !== "learning" && !segment.endsWith(".do"))
    ?? "gasuwonlib";

  return buildSearchRequest(
    new URL(
      `/library/${libraryKey}/contents/learning/lib/07/lib.07.001.motion?mnucd=MENU0300025&loca=H0000014`,
      homepageUrl.origin,
    ).toString(),
    "post",
    {
      searchCnd: "allitem",
      searchWrd: searchTerm,
    },
    "known",
    "known:daejeon-seogu-learning-search",
  );
}

function buildEunpyeongLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://lib.eplib.or.kr/unified/search.asp",
    "post",
    {
      totalSearchValue: searchTerm,
    },
    "known",
    "known:eunpyeong-unified-search",
  );
}

function buildYangpyeongLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://www.yplib.go.kr/searchResult",
    "get",
    {
      keyword: searchTerm,
      pageIndex: "1",
    },
    "known",
    "known:yangpyeong-search-result",
  );
}

function buildGeumcheonLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://geumcheonlib.seoul.kr/geumcheonlib/uce/search/totalList.do?selfId=1097",
    "post",
    {
      searchKeyword: searchTerm,
    },
    "known",
    "known:geumcheon-total-search",
  );
}

function buildEumseongLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://lib.eumseong.go.kr/lib/front/index.php",
    "get",
    {
      g_page: "search",
      m_page: "search01",
      search_type: "NORMAL",
      search_txt: searchTerm,
    },
    "known",
    "known:eumseong-front-search",
  );
}

function buildPyeongchangLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://www.pc.go.kr/lib/main/site/search/bookSearch.do",
    "get",
    {
      cmd_name: "bookandnonbooksearch",
      search_type: "detail",
      use_facet: "N",
      search_item: "search_title",
      search_txt: searchTerm,
    },
    "known",
    "known:pyeongchang-book-search",
  );
}

function buildUljinLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://lib.uljin.go.kr/content/01search/01_01.php",
    "get",
    {
      TAG1_cmd: "IAL",
      TAG1_keyword: searchTerm,
    },
    "known",
    "known:uljin-total-search",
  );
}

function buildWanjuLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    `https://lib.wanju.go.kr:8443/search/keyword/${encodeURIComponent(searchTerm)}`,
    "get",
    {},
    "known",
    "known:wanju-spa-search",
  );
}

function buildBusanMiracleLibrarySearchRequest(searchTerm: string) {
  return buildSearchRequest(
    "https://library.busan.go.kr/gsmbooks/book/search/collectionOfMaterials",
    "post",
    {
      procMode: "search",
      search_type: "detail",
      pageno: "1",
      search_field: "search_title",
      search_txt: searchTerm,
    },
    "known",
    "known:busan-miracle-search",
  );
}

function createSearchTermOnlyKnownResolver(
  builder: (searchTerm: string) => LibrarySearchRequest,
): KnownLibrarySearchResolver {
  return (_homepageUrl, searchTerm) => builder(searchTerm);
}

function createHomepageAwareKnownResolver(
  builder: (homepageUrl: URL, searchTerm: string) => LibrarySearchRequest | null,
): KnownLibrarySearchResolver {
  return (homepageUrl, searchTerm) => builder(homepageUrl, searchTerm);
}

function createHomepageAwareKnownResolverWithFallback(
  builder: (homepageUrl: URL, searchTerm: string) => LibrarySearchRequest | null,
): KnownLibrarySearchResolver {
  return (homepageUrl, searchTerm) => builder(homepageUrl, searchTerm) ?? buildFallbackRequest(homepageUrl);
}

const KNOWN_LIBRARY_SEARCH_RESOLVERS: Record<string, KnownLibrarySearchResolver> = {
  "library.gangnam.go.kr": createHomepageAwareKnownResolverWithFallback(buildGangnamLibrarySearchRequest),
  "junggulib.or.kr": createHomepageAwareKnownResolver(buildJungguLibrarySearchRequest),
  "sdlib.or.kr": createHomepageAwareKnownResolver(buildSeongdongLibrarySearchRequest),
  "lib.yangcheon.or.kr": createHomepageAwareKnownResolverWithFallback(buildYangcheonLibrarySearchRequest),
  "lib.gwanak.go.kr": createHomepageAwareKnownResolver(buildGwanakLibrarySearchRequest),
  "lib.sdm.or.kr": createHomepageAwareKnownResolver(buildSeodaemunLibrarySearchRequest),
  "l4d.or.kr": createHomepageAwareKnownResolver(buildDongdaemunLibrarySearchRequest),
  "mplib.mapo.go.kr": createHomepageAwareKnownResolver(buildMapoLibrarySearchRequest),
  "lib.gimhae.go.kr": createSearchTermOnlyKnownResolver(buildGimhaeLibrarySearchRequest),
  "bcl.go.kr": createSearchTermOnlyKnownResolver(buildBucheonLibrarySearchRequest),
  "apl.go.kr": createSearchTermOnlyKnownResolver(buildAnseongLibrarySearchRequest),
  "lib.dongjak.go.kr": createSearchTermOnlyKnownResolver(buildDongjakLibrarySearchRequest),
  "gjl.gimje.go.kr": createSearchTermOnlyKnownResolver(buildGimjeLibrarySearchRequest),
  "library.cheongju.go.kr": createSearchTermOnlyKnownResolver(buildCheongjuLibrarySearchRequest),
  "uilib.go.kr": createSearchTermOnlyKnownResolver(buildUijeongbuLibrarySearchRequest),
  "library.donggu.ulsan.kr": createSearchTermOnlyKnownResolver(buildDongguUlsanLibrarySearchRequest),
  "lib.chungju.go.kr": createSearchTermOnlyKnownResolver(buildChungjuLibrarySearchRequest),
  "lib.gjcity.go.kr": createSearchTermOnlyKnownResolver(buildGwangjuSmallLibrarySearchRequest),
  "dangjin.go.kr": createSearchTermOnlyKnownResolver(buildDangjinLibrarySearchRequest),
  "lib.siheung.go.kr": createHomepageAwareKnownResolver(buildPyxisHashSearchRequest),
  "seogu.go.kr": createHomepageAwareKnownResolver(buildSeoguLibrarySearchRequest),
  "eplib.or.kr": createSearchTermOnlyKnownResolver(buildEunpyeongLibrarySearchRequest),
  "yplib.go.kr": createSearchTermOnlyKnownResolver(buildYangpyeongLibrarySearchRequest),
  "geumcheonlib.seoul.kr": createSearchTermOnlyKnownResolver(buildGeumcheonLibrarySearchRequest),
  "lib.eumseong.go.kr": createSearchTermOnlyKnownResolver(buildEumseongLibrarySearchRequest),
  "pc.go.kr": createSearchTermOnlyKnownResolver(buildPyeongchangLibrarySearchRequest),
  "lib.uljin.go.kr": createSearchTermOnlyKnownResolver(buildUljinLibrarySearchRequest),
  "lib.wanju.go.kr": createSearchTermOnlyKnownResolver(buildWanjuLibrarySearchRequest),
  "library.bsgangseo.go.kr": createSearchTermOnlyKnownResolver(buildBusanMiracleLibrarySearchRequest),
  "splib.or.kr": createHomepageAwareKnownResolverWithFallback(buildSongpaLibrarySearchRequest),
};

function resolveKnownLibraryHomepageSearchRequest(homepageUrl: URL, searchTerm: string) {
  const hostname = homepageUrl.hostname.replace(/^www\./i, "").toLowerCase();
  return KNOWN_LIBRARY_SEARCH_RESOLVERS[hostname]?.(homepageUrl, searchTerm) ?? null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value: string) {
  return decodeHtmlEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseHtmlAttributes(markup: string) {
  const attributes: Record<string, string> = {};
  const matcher =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null = matcher.exec(markup);

  while (match) {
    const [, rawKey, doubleQuoted, singleQuoted, bareValue] = match;
    attributes[rawKey.toLowerCase()] = decodeHtmlEntities(
      doubleQuoted ?? singleQuoted ?? bareValue ?? "",
    );
    match = matcher.exec(markup);
  }

  return attributes;
}

function isTruthyAttribute(value: string | undefined) {
  return value !== undefined;
}

function isBadFallbackTarget(targetUrl: URL) {
  return BAD_FALLBACK_TARGET_HINT.test(`${targetUrl.hostname}${targetUrl.pathname}${targetUrl.search}`);
}

function resolveUrlCandidate(
  target: string,
  baseUrl: URL,
  options: {
    allowHash?: boolean;
  } = {},
) {
  const trimmed = target.trim();

  if (!trimmed || /^javascript:/i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return null;
  }

  try {
    if (options.allowHash && trimmed.startsWith("#")) {
      const url = new URL(baseUrl.toString());
      url.hash = trimmed.slice(1);
      return url;
    }

    return new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
}

function readSiteFamilyKey(url: URL) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);

  if (parts.length >= 3 && parts[parts.length - 1] === "kr") {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".") || host;
}

function isRelatedSiteUrl(candidate: URL, originUrl: URL) {
  return readSiteFamilyKey(candidate) === readSiteFamilyKey(originUrl);
}

function parseFormMethod(value: string | undefined): LibrarySearchMethod {
  return value?.toLowerCase() === "post" ? "post" : "get";
}

function extractSelectedOptionValue(markup: string) {
  const options = Array.from(markup.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi));

  if (options.length === 0) {
    return "";
  }

  const selected = options.find(([, attributes]) =>
    isTruthyAttribute(parseHtmlAttributes(attributes).selected),
  );
  const matched = selected ?? options[0];
  const attrs = parseHtmlAttributes(matched[1]);

  return attrs.value ?? stripTags(matched[2]);
}

function scoreKeywordField(label: string) {
  const normalized = label.toLowerCase();
  let score = 0;

  if (SEARCH_TEXT_HINT.test(normalized)) {
    score += 5;
  }

  if (/searchkeyword|searchword|searchwrd|keyword|query|searchtxt/.test(normalized)) {
    score += 4;
  }

  if (/title|book|도서|서명/.test(normalized)) {
    score += 2;
  }

  if (/isbn/.test(normalized)) {
    score -= 1;
  }

  return score;
}

function scoreSubmitTrigger(formMarkup: string, attributesLabel: string) {
  let score = 0;
  const normalized = `${formMarkup} ${attributesLabel}`;

  if (/submit/i.test(normalized)) {
    score += 1;
  }

  if (/검색|search/i.test(stripTags(normalized))) {
    score += 3;
  }

  return score;
}

function isSearchPageContext(page: FetchedHtmlPage, attributesLabel: string) {
  const contextText = stripTags(
    `${attributesLabel} ${page.html.slice(0, 2500)} ${page.url.pathname} ${page.url.search}`,
  );

  return SEARCH_TEXT_HINT.test(contextText) || /통합검색|자료검색|검색하기/.test(contextText);
}

function collectParsedFormFields(formMarkup: string) {
  const defaultFields: Record<string, string> = {};
  const keywordInputs: KeywordInputCandidate[] = [];

  for (const [, attributesSource] of formMarkup.matchAll(/<input\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(attributesSource);
    const type = (attributes.type ?? "text").toLowerCase();
    const name = attributes.name ?? "";
    const id = attributes.id ?? "";
    const label = [name, id, attributes.placeholder, attributes.title].filter(Boolean).join(" ");

    if (!name) {
      continue;
    }

    if (type === "hidden") {
      defaultFields[name] = attributes.value ?? "";
      continue;
    }

    if ((type === "checkbox" || type === "radio") && isTruthyAttribute(attributes.checked)) {
      defaultFields[name] = attributes.value ?? "on";
      continue;
    }

    if (type === "text" || type === "search" || type === "email" || type === "") {
      keywordInputs.push({
        label,
        name,
        score: scoreKeywordField(label),
      });
    }
  }

  for (const [, selectAttributesSource, selectMarkup] of formMarkup.matchAll(
    /<select\b([^>]*)>([\s\S]*?)<\/select>/gi,
  )) {
    const attributes = parseHtmlAttributes(selectAttributesSource);
    const name = attributes.name ?? "";

    if (!name) {
      continue;
    }

    defaultFields[name] = extractSelectedOptionValue(selectMarkup);
  }

  for (const [, textareaAttributesSource] of formMarkup.matchAll(/<textarea\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(textareaAttributesSource);
    const name = attributes.name ?? "";
    const id = attributes.id ?? "";
    const label = [name, id, attributes.placeholder, attributes.title].filter(Boolean).join(" ");

    if (!name) {
      continue;
    }

    keywordInputs.push({
      label,
      name,
      score: scoreKeywordField(label),
    });
  }

  return {
    defaultFields,
    keywordInputs,
  };
}

function extractScriptAssignedFieldValues(html: string, formNameOrId?: string) {
  const assignedFields: Record<string, string> = {};

  if (!formNameOrId) {
    return assignedFields;
  }

  const escapedFormNameOrId = formNameOrId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const formVariableNames = new Set<string>();
  const jqueryAliasPattern = new RegExp(
    `(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*\\$\\(\\s*["']#${escapedFormNameOrId}["']\\s*\\)`,
    "gi",
  );

  for (const match of html.matchAll(jqueryAliasPattern)) {
    formVariableNames.add(match[1]);
  }

  for (const variableName of formVariableNames) {
    const escapedVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const jqueryFieldPattern = new RegExp(
      `\\b${escapedVariableName}\\.find\\(\\s*["']input\\[name=([A-Za-z0-9_-]+)\\]["']\\s*\\)\\.val\\(\\s*["']([^"']*)["']\\s*\\)`,
      "gi",
    );

    for (const match of html.matchAll(jqueryFieldPattern)) {
      assignedFields[match[1]] = decodeHtmlEntities(match[2]);
    }
  }

  return assignedFields;
}

function extractSearchActionHints(html: string, pageUrl: URL, formNameOrId?: string) {
  const candidates = new Set<string>();

  if (formNameOrId) {
    const escapedName = formNameOrId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scopedPattern = new RegExp(
      `document(?:\\.forms\\[['"]${escapedName}['"]\\]|\\.${escapedName}|\\.getElementById\\(['"]${escapedName}['"]\\))[\\s\\S]{0,1200}?action\\s*=\\s*["']([^"']+)["']`,
      "gi",
    );

    for (const match of html.matchAll(scopedPattern)) {
      const resolved = resolveUrlCandidate(match[1], pageUrl);

      if (resolved && SEARCH_ACTION_HINT.test(resolved.pathname)) {
        candidates.add(resolved.toString());
      }
    }

    const formVariableNames = new Set<string>();
    const aliasPattern = new RegExp(
      `(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*document(?:\\.forms\\[['"]${escapedName}['"]\\]|\\.${escapedName}|\\.getElementById\\(['"]${escapedName}['"]\\))`,
      "gi",
    );

    for (const match of html.matchAll(aliasPattern)) {
      formVariableNames.add(match[1]);
    }

    for (const variableName of formVariableNames) {
      const escapedVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const variableActionPattern = new RegExp(
        `\\b${escapedVariableName}\\.action\\s*=\\s*["']([^"']+)["']`,
        "gi",
      );

      for (const match of html.matchAll(variableActionPattern)) {
        const resolved = resolveUrlCandidate(match[1], pageUrl);

        if (resolved && SEARCH_ACTION_HINT.test(resolved.pathname)) {
          candidates.add(resolved.toString());
        }
      }
    }
  }

  const globalPattern = /action\s*=\s*["']([^"']*(?:search|Search|srch|Srch|bookSearch|plusSearch)[^"']*)["']/gi;

  for (const match of html.matchAll(globalPattern)) {
    const resolved = resolveUrlCandidate(match[1], pageUrl);

    if (resolved && resolved.origin === pageUrl.origin) {
      candidates.add(resolved.toString());
    }
  }

  return Array.from(candidates);
}

function scoreSearchForm(
  attributesLabel: string,
  actionUrl: URL,
  keywordInput: KeywordInputCandidate,
  defaultFields: Record<string, string>,
) {
  let score = keywordInput.score;

  if (SEARCH_TEXT_HINT.test(attributesLabel)) {
    score += 4;
  }

  if (SEARCH_ACTION_HINT.test(actionUrl.pathname)) {
    score += 6;
  }

  for (const fieldName of Object.keys(defaultFields)) {
    if (SEARCH_TEXT_HINT.test(fieldName)) {
      score += 1;
    }
  }

  return score;
}

function parseSearchFormsFromHtml(page: FetchedHtmlPage, searchTerm: string) {
  const candidates: ParsedFormCandidate[] = [];

  for (const [, formAttributesSource, formMarkup] of page.html.matchAll(
    /<form\b([^>]*)>([\s\S]*?)<\/form>/gi,
  )) {
    const formAttributes = parseHtmlAttributes(formAttributesSource);
    const formNameOrId = formAttributes.name ?? formAttributes.id ?? "";
    const attributesLabel = [
      formAttributes.name,
      formAttributes.id,
      formAttributes.class,
      formAttributes.onsubmit,
      stripTags(formMarkup.slice(0, 500)),
    ]
      .filter(Boolean)
      .join(" ");
    const actionHints = extractSearchActionHints(page.html, page.url, formNameOrId);
    const actionCandidate =
      formAttributes.action && formAttributes.action.trim() && formAttributes.action.trim() !== "#"
        ? resolveUrlCandidate(formAttributes.action, page.url)
        : actionHints[0]
          ? new URL(actionHints[0])
          : null;
    const { defaultFields, keywordInputs } = collectParsedFormFields(formMarkup);
    const scriptAssignedFields = extractScriptAssignedFieldValues(page.html, formNameOrId);
    const mergedDefaultFields = {
      ...defaultFields,
    };

    for (const [fieldName, fieldValue] of Object.entries(scriptAssignedFields)) {
      if (!mergedDefaultFields[fieldName]?.trim()) {
        mergedDefaultFields[fieldName] = fieldValue;
      }
    }

    const keywordInput = keywordInputs.sort((left, right) => right.score - left.score)[0];
    const submitScore = scoreSubmitTrigger(formMarkup, attributesLabel);
    const searchPageContext = isSearchPageContext(page, attributesLabel);
    const searchFieldContext =
      SEARCH_TEXT_HINT.test(attributesLabel) ||
      SEARCH_TEXT_HINT.test(Object.keys(mergedDefaultFields).join(" ")) ||
      keywordInput?.score >= 3;

    if (!keywordInput || keywordInput.score < 1 || submitScore < 1) {
      continue;
    }

    const resolvedActionCandidate =
      actionCandidate ??
      (SEARCH_TEXT_HINT.test(attributesLabel) || submitScore >= 3
        ? new URL(page.url.toString())
        : null);

    if (
      !resolvedActionCandidate ||
      (!SEARCH_ACTION_HINT.test(resolvedActionCandidate.pathname) &&
        !(searchPageContext && searchFieldContext))
    ) {
      continue;
    }

    const fields = {
      ...mergedDefaultFields,
      [keywordInput.name]: searchTerm,
    };

    candidates.push({
      action: resolvedActionCandidate.toString(),
      method: parseFormMethod(formAttributes.method),
      fields,
      score:
        scoreSearchForm(attributesLabel, resolvedActionCandidate, keywordInput, mergedDefaultFields) +
        submitScore,
    });
  }

  return candidates.sort((left, right) => right.score - left.score);
}

function extractSearchLinks(html: string, pageUrl: URL) {
  const candidates = new Map<string, number>();

  for (const [, attributesSource, innerMarkup] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = parseHtmlAttributes(attributesSource);
    const href = attributes.href ?? "";
    const resolved = resolveUrlCandidate(href, pageUrl);

    if (!resolved) {
      continue;
    }

    const strippedLabel = stripTags(innerMarkup);
    const linkLabel = `${href} ${strippedLabel}`;
    const sameSiteFamily = isRelatedSiteUrl(resolved, pageUrl);
    const strongSearchLabel = /자료\s*검색|통합검색|도서검색|소장자료검색|book search/i.test(strippedLabel);

    if (
      !sameSiteFamily &&
      !(strongSearchLabel && (SEARCH_ACTION_HINT.test(resolved.pathname) || /book/i.test(resolved.pathname)))
    ) {
      continue;
    }

    if (!SEARCH_TEXT_HINT.test(linkLabel) && !SEARCH_ACTION_HINT.test(resolved.pathname) && !strongSearchLabel) {
      continue;
    }

    if (/login|member|join|mypage|program|lecture/i.test(resolved.pathname)) {
      continue;
    }

    const score =
      (SEARCH_ACTION_HINT.test(resolved.pathname) ? 6 : 0) +
      (SEARCH_TEXT_HINT.test(linkLabel) ? 4 : 0) +
      (strongSearchLabel ? 4 : 0) +
      (sameSiteFamily ? 2 : 0) +
      (/collectionofmaterials|booksearch/i.test(resolved.pathname) ? 3 : 0);
    candidates.set(
      resolved.toString(),
      Math.max(score, candidates.get(resolved.toString()) ?? Number.MIN_SAFE_INTEGER),
    );
  }

  return Array.from(candidates.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([url]) => url);
}

function extractScriptRedirectTarget(html: string, pageUrl: URL) {
  const metaRedirect = META_REFRESH_PATTERN.exec(html);

  if (metaRedirect?.[1]) {
    return resolveUrlCandidate(metaRedirect[1], pageUrl);
  }

  for (const [, scriptSource] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const normalized = scriptSource
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n\r]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const directAssignmentMatch =
      /^(?:(?:window|self|document)\.)?location(?:\.href)?\s*=\s*["']([^"']+)["'];?$/i.exec(
        normalized,
      ) ??
      /^(?:(?:window|self|document)\.)?location\.replace\(\s*["']([^"']+)["']\s*\);?$/i.exec(
        normalized,
      );

    if (directAssignmentMatch?.[1]) {
      return resolveUrlCandidate(directAssignmentMatch[1], pageUrl);
    }

    const readyWrapperMatch =
      /^\$\(\s*function\s*\(\s*\)\s*\{\s*(?:(?:window|self|document)\.)?location(?:\.href)?\s*=\s*["']([^"']+)["'];?\s*\}\s*\);?$/i.exec(
        normalized,
      ) ??
      /^\$\(\s*document\s*\)\.ready\(\s*function\s*\(\s*\)\s*\{\s*(?:(?:window|self|document)\.)?location(?:\.href)?\s*=\s*["']([^"']+)["'];?\s*\}\s*\);?$/i.exec(
        normalized,
      ) ??
      /^jQuery\(\s*function\s*\(\s*\)\s*\{\s*(?:(?:window|self|document)\.)?location(?:\.href)?\s*=\s*["']([^"']+)["'];?\s*\}\s*\);?$/i.exec(
        normalized,
      );

    if (readyWrapperMatch?.[1]) {
      return resolveUrlCandidate(readyWrapperMatch[1], pageUrl);
    }
  }

  return null;
}

async function fetchWithTimeout(target: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(target, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildInsecureProtocolFallbackUrl(target: URL) {
  if (target.protocol !== "https:") {
    return null;
  }

  const fallbackUrl = new URL(target.toString());
  fallbackUrl.protocol = "http:";
  return fallbackUrl;
}

async function fetchHtmlPage(
  target: URL,
  depth = 0,
  allowProtocolFallback = true,
): Promise<FetchedHtmlPage> {
  let response: Response;

  try {
    response = await fetchWithTimeout(target.toString(), {
      headers: FETCH_HEADERS,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (error) {
    const insecureFallbackUrl =
      allowProtocolFallback && target.protocol === "https:"
        ? buildInsecureProtocolFallbackUrl(target)
        : null;

    if (insecureFallbackUrl) {
      return fetchHtmlPage(insecureFallbackUrl, depth, false);
    }

    throw error;
  }

  const html = await response.text();
  const pageUrl = new URL(response.url || target.toString());

  if (depth < 2) {
    const redirectTarget = extractScriptRedirectTarget(html, pageUrl);

    if (redirectTarget && redirectTarget.toString() !== pageUrl.toString()) {
      return fetchHtmlPage(redirectTarget, depth + 1);
    }
  }

  return {
    html,
    status: response.status,
    url: pageUrl,
  };
}

async function fetchTextAsset(target: URL, allowProtocolFallback = true): Promise<string> {
  try {
    const response = await fetchWithTimeout(target.toString(), {
      headers: FETCH_HEADERS,
      redirect: "follow",
      cache: "no-store",
    });

    return response.text();
  } catch (error) {
    const insecureFallbackUrl =
      allowProtocolFallback && target.protocol === "https:"
        ? buildInsecureProtocolFallbackUrl(target)
        : null;

    if (insecureFallbackUrl) {
      return fetchTextAsset(insecureFallbackUrl, false);
    }

    throw error;
  }
}

function collectBundleScriptUrls(html: string, pageUrl: URL) {
  const bundles = new Set<string>();

  for (const [, attributesSource] of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(attributesSource);
    const src = attributes.src ?? "";
    const resolved = resolveUrlCandidate(src, pageUrl);

    if (!resolved || resolved.origin !== pageUrl.origin) {
      continue;
    }

    if (!resolved.pathname.endsWith(".js")) {
      continue;
    }

    bundles.add(resolved.toString());
  }

  return Array.from(bundles).slice(0, 3);
}

function extractSpaKeywordRoute(scriptSource: string) {
  const routeMatches = Array.from(
    scriptSource.matchAll(/path:"(\/[^"]*(?:keyword|search)[^"]*:[^"]+)"/gi),
  );
  const bestMatch = routeMatches.find(([, route]) => /keywordsearchresult/i.test(route))
    ?? routeMatches.find(([, route]) => /searchresult/i.test(route))
    ?? routeMatches[0];

  return bestMatch?.[1] ?? "";
}

function substituteSpaRoutePattern(routePattern: string, searchTerm: string) {
  return routePattern
    .replace(/:([^/*]+)\*/g, encodeURIComponent(searchTerm))
    .replace(/:([^/]+)/g, encodeURIComponent(searchTerm));
}

function buildHashSpaSearchRequest(pageUrl: URL, routePattern: string, searchTerm: string) {
  if (!routePattern || !routePattern.includes(":")) {
    return null;
  }

  const substitutedRoute = substituteSpaRoutePattern(routePattern, searchTerm);
  const appBasePath = pageUrl.pathname.endsWith("/")
    ? pageUrl.pathname
    : `${pageUrl.pathname.replace(/\/[^/]*$/, "")}/`;
  const appBaseUrl = new URL(appBasePath, pageUrl.origin);

  appBaseUrl.hash = substitutedRoute.startsWith("/") ? substitutedRoute : `/${substitutedRoute}`;

  return buildSearchRequest(appBaseUrl.toString(), "get", {}, "spa", "family:spa-hash-route");
}

function buildPathSpaSearchRequest(pageUrl: URL, routePattern: string, searchTerm: string) {
  if (!routePattern || !routePattern.includes(":")) {
    return null;
  }

  const substitutedRoute = substituteSpaRoutePattern(routePattern, searchTerm);
  const appBasePath = pageUrl.pathname.endsWith("/")
    ? pageUrl.pathname
    : `${pageUrl.pathname.replace(/\/[^/]*$/, "")}/`;
  const appBaseUrl = new URL(appBasePath, pageUrl.origin);
  const actionUrl = substitutedRoute.startsWith("/")
    ? new URL(substitutedRoute, pageUrl.origin)
    : new URL(substitutedRoute, appBaseUrl);

  return buildSearchRequest(actionUrl.toString(), "get", {}, "spa", "family:spa-route");
}

function looksLikeSpaShell(html: string) {
  return /<div[^>]+id=["']?app["']?/i.test(html) || /<script\b[^>]+src=[^>]+\.js/i.test(html);
}

async function discoverPathSpaSearchRequest(page: FetchedHtmlPage, routePattern: string, searchTerm: string) {
  const request = buildPathSpaSearchRequest(page.url, routePattern, searchTerm);

  if (!request) {
    return null;
  }

  try {
    const directPage = await fetchHtmlPage(new URL(request.action), 0);

    if (directPage.status >= 400 || !looksLikeSpaShell(directPage.html)) {
      return null;
    }

    return buildSearchRequest(directPage.url.toString(), "get", {}, "spa", "family:spa-route");
  } catch {
    return null;
  }
}

async function discoverSpaSearchRequest(page: FetchedHtmlPage, searchTerm: string) {
  const bundleUrls = collectBundleScriptUrls(page.html, page.url);

  for (const bundleUrl of bundleUrls) {
    try {
      const scriptSource = await fetchTextAsset(new URL(bundleUrl));
      const routePattern = extractSpaKeywordRoute(scriptSource);
      const request =
        (await discoverPathSpaSearchRequest(page, routePattern, searchTerm))
        ?? buildHashSpaSearchRequest(page.url, routePattern, searchTerm);

      if (request) {
        return request;
      }
    } catch {
      // Ignore bundle fetch failures and continue with the next heuristic.
    }
  }

  return null;
}

function buildPyxisHashSearchRequest(pageUrl: URL, searchTerm: string) {
  const appBasePath = pageUrl.pathname.endsWith("/")
    ? pageUrl.pathname
    : `${pageUrl.pathname.replace(/\/[^/]*$/, "")}/`;
  const appBaseUrl = new URL(appBasePath, pageUrl.origin);

  appBaseUrl.hash = `/search/ex?all=${encodeURIComponent(`1|k|a|${searchTerm}`)}`;

  return buildSearchRequest(appBaseUrl.toString(), "get", {}, "spa", "family:pyxis-hash-search");
}

async function discoverPyxisSearchRequest(page: FetchedHtmlPage, searchTerm: string) {
  const bundleUrls = collectBundleScriptUrls(page.html, page.url);

  for (const bundleUrl of bundleUrls) {
    try {
      const scriptSource = await fetchTextAsset(new URL(bundleUrl));
      const isPyxisSearchBundle =
        scriptSource.includes('state("root.search",{url:"/search?') &&
        (scriptSource.includes("SEARCH_EX_STATE") || scriptSource.includes("#/search/ex"));

      if (!isPyxisSearchBundle) {
        continue;
      }

      return buildPyxisHashSearchRequest(page.url, searchTerm);
    } catch {
      // Ignore bundle fetch failures and continue with the next heuristic.
    }
  }

  return null;
}

async function discoverFormSearchRequestFromPage(
  page: FetchedHtmlPage,
  searchTerm: string,
  visited: Set<string>,
  depth = 0,
): Promise<LibrarySearchRequest | null> {
  const directFormMatch = parseSearchFormsFromHtml(page, searchTerm)[0];

  if (directFormMatch) {
    return buildSearchRequest(
      directFormMatch.action,
      directFormMatch.method,
      directFormMatch.fields,
      "form",
      "family:html-form",
    );
  }

  if (depth < 1) {
    for (const linkUrl of extractSearchLinks(page.html, page.url).slice(0, 4)) {
      if (visited.has(linkUrl)) {
        continue;
      }

      visited.add(linkUrl);

      try {
        const nestedPage = await fetchHtmlPage(new URL(linkUrl));
        const nestedResult = await discoverFormSearchRequestFromPage(
          nestedPage,
          searchTerm,
          visited,
          depth + 1,
        );

        if (nestedResult) {
          return nestedResult;
        }
      } catch {
        // Ignore discovery failures on individual linked pages.
      }
    }
  }

  return null;
}

function createResolverContext(
  homepageUrl: URL,
  payload: LibraryHomepageSearchPayload,
  searchTerm: string,
): ResolverContext {
  let homepagePagePromise: Promise<FetchedHtmlPage> | null = null;

  const fetchPage = (target: URL) => fetchHtmlPage(target);

  return {
    homepageUrl,
    payload,
    searchTerm,
    fetchPage,
    getHomepagePage: () => {
      if (!homepagePagePromise) {
        homepagePagePromise = fetchPage(homepageUrl);
      }

      return homepagePagePromise;
    },
  };
}

const HOMEPAGE_SEARCH_ADAPTERS: SearchRequestAdapter[] = [
  {
    id: "site-overrides",
    resolve(context) {
      return resolveKnownLibraryHomepageSearchRequest(context.homepageUrl, context.searchTerm);
    },
  },
  {
    id: "linked-html-form",
    async resolve(context) {
      const homepagePage = await context.getHomepagePage();

      return discoverFormSearchRequestFromPage(
        homepagePage,
        context.searchTerm,
        new Set([homepagePage.url.toString()]),
      );
    },
  },
  {
    id: "pyxis-hash-search",
    async resolve(context) {
      const homepagePage = await context.getHomepagePage();

      return discoverPyxisSearchRequest(homepagePage, context.searchTerm);
    },
  },
  {
    id: "spa-hash-route",
    async resolve(context) {
      const homepagePage = await context.getHomepagePage();

      return discoverSpaSearchRequest(homepagePage, context.searchTerm);
    },
  },
  {
    id: "homepage-fallback",
    async resolve(context) {
      try {
        const homepagePage = await context.getHomepagePage();
        return buildFallbackRequest(
          isBadFallbackTarget(homepagePage.url) ? context.homepageUrl : homepagePage.url,
        );
      } catch {
        return buildFallbackRequest(context.homepageUrl);
      }
    },
  },
];

export async function resolveLibraryHomepageSearchRequest(payload: LibraryHomepageSearchPayload) {
  const normalizedHomepage = normalizeHomepageUrl(payload.homepage);

  if (!normalizedHomepage) {
    return null;
  }

  try {
    const homepageUrl = new URL(normalizedHomepage);
    const searchTerm = readPrimarySearchTerm(payload);

    if (!searchTerm) {
      return buildFallbackRequest(homepageUrl);
    }

    const context = createResolverContext(homepageUrl, payload, searchTerm);

    for (const adapter of HOMEPAGE_SEARCH_ADAPTERS) {
      let resolvedRequest: LibrarySearchRequest | null = null;

      try {
        resolvedRequest = await adapter.resolve(context);
      } catch {
        resolvedRequest = null;
      }

      if (resolvedRequest) {
        return resolvedRequest;
      }
    }

    return buildFallbackRequest(homepageUrl);
  } catch {
    return null;
  }
}
