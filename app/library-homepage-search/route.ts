import { NextRequest, NextResponse } from "next/server";
import {
  LibrarySearchRequest,
  resolveLibraryHomepageSearchRequest,
} from "@/lib/library-homepage-search-resolver";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildGetTargetUrl(request: LibrarySearchRequest) {
  const targetUrl = new URL(request.action);

  for (const [name, value] of Object.entries(request.fields)) {
    targetUrl.searchParams.set(name, value);
  }

  return targetUrl.toString();
}

function renderPostAutoSubmitPage(request: LibrarySearchRequest) {
  const inputs = Object.entries(request.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>도서관 홈페이지 검색 연결 중</title>
    <style>
      body { font-family: sans-serif; padding: 24px; line-height: 1.5; }
      .wrap { max-width: 560px; margin: 0 auto; }
      button { margin-top: 16px; padding: 10px 16px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <p>도서관 홈페이지 검색 페이지로 이동 중입니다.</p>
      <p>자동 이동이 되지 않으면 아래 버튼을 눌러 주세요.</p>
      <form id="library-homepage-search-form" method="${request.method}" action="${escapeHtml(request.action)}">
        ${inputs}
        <button type="submit">계속하기</button>
      </form>
    </div>
    <script>
      document.getElementById("library-homepage-search-form")?.submit();
    </script>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const homepage = request.nextUrl.searchParams.get("homepage") ?? "";
  const title = request.nextUrl.searchParams.get("title") ?? "";
  const isbn = request.nextUrl.searchParams.get("isbn") ?? "";
  const debug = request.nextUrl.searchParams.get("debug") === "1";
  const resolvedRequest = await resolveLibraryHomepageSearchRequest({
    homepage,
    title,
    isbn,
  });

  if (!resolvedRequest) {
    if (debug) {
      return NextResponse.json({
        ok: false,
        reason: "invalid_homepage",
        homepage,
        title,
        isbn,
      });
    }

    try {
      const fallbackResponse = NextResponse.redirect(new URL(homepage));
      fallbackResponse.headers.set("x-bookmap-library-search-adapter", "invalid-homepage");
      return fallbackResponse;
    } catch {
      const fallbackResponse = NextResponse.redirect(new URL("/", request.url));
      fallbackResponse.headers.set("x-bookmap-library-search-adapter", "invalid-homepage");
      return fallbackResponse;
    }
  }

  if (debug) {
    return NextResponse.json({
      ok: true,
      request: resolvedRequest,
    });
  }

  if (resolvedRequest.method === "get") {
    const redirectResponse = NextResponse.redirect(buildGetTargetUrl(resolvedRequest));
    redirectResponse.headers.set("x-bookmap-library-search-adapter", resolvedRequest.adapterId);
    return redirectResponse;
  }

  const htmlResponse = new NextResponse(renderPostAutoSubmitPage(resolvedRequest), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

  htmlResponse.headers.set("x-bookmap-library-search-adapter", resolvedRequest.adapterId);
  return htmlResponse;
}
