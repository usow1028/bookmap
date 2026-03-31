# Bookmap MVP Prototype

공공도서관 소장·대출 가능 도서를 지도 위에서 바로 탐색하는 `Bookmap` 프로토타입입니다.

## 현재 구현 범위

- 단일 메인 화면
  - 나의 위치 입력
  - 찾고 싶은 책 입력
  - 현재 위치 권한 요청
  - 주소/건물명/상호명 자동완성
  - NAVER 지도에 결과 표시
- API
  - `GET /api/search`
  - `GET /api/location-suggestions`
  - `GET /api/location-reverse`
  - 도서관 정보나루 실연동
  - NAVER Geocoding / Reverse Geocoding / Directions 5 연동
  - 선택형 POI 검색 연동 구조 (`NAVER Local Search`, `Kakao Local`)

## 기술 스택

- Next.js App Router
- React 19
- TypeScript
- NAVER Maps JavaScript API v3

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

실데이터를 사용하려면 서버 환경변수 `DATA4LIBRARY_API_KEY`를 두거나 루트의 `data4libraryapi.md` 파일에 인증키를 넣으면 됩니다.
네이버 지도와 경로 API는 `.env.local`의 `NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_SECRET`를 사용합니다.
상호명/건물명/아파트명 자동완성을 강화하려면 `.env.local`에 `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`, `KAKAO_REST_API_KEY`를 선택적으로 추가하세요. 현재 자동완성은 `Juso + NAVER Geocoding + NAVER Local Search + Kakao Local Search + OSM fallback` 순으로 후보를 모아 재정렬합니다.
공공 주소 자동완성을 우선 사용하려면 `.env.local`에 `JUSO_API_KEY` 또는 `JUSO_CONFM_KEY`를 추가하면 됩니다. 이 경우 도로명주소 안내시스템 검색 결과를 먼저 쓰고, 네이버 지오코딩으로 좌표를 붙입니다.
`Dynamic Map`은 등록한 `Web 서비스 URL`과 실제 접속 포트가 정확히 일치해야 합니다. `http://localhost:3000`만 등록했다면 `3001`에서는 지도 인증이 실패합니다.

## 검증 명령

```bash
npm run lint
npm run typecheck
npm run build
```

## 주요 파일

- `app/page.tsx`: 홈 화면
- `components/BookmapWorkspace.tsx`: 단일 검색 워크스페이스
- `components/LibraryMapClient.tsx`: NAVER 지도 렌더링
- `app/api/search/route.ts`: 검색 API
- `app/api/location-suggestions/route.ts`: 위치 자동완성 API
- `app/api/location-reverse/route.ts`: 현재 위치 역지오코딩 API
- `lib/search.ts`: 실데이터 검색 라우팅
- `lib/data4library.ts`: 도서관 정보나루 실데이터 연동
- `lib/naver-maps.ts`: NAVER Geocoding / Directions 5 연동
- `lib/place-search.ts`: NAVER Local Search / Kakao Local 선택 연동
- `lib/juso.ts`: 공공 도로명주소 검색 연동
- `lib/location.ts`: 위치 해석
- `lib/region.ts`: 지역 코드 해석

## 구현 메모

- 지도는 NAVER Maps JavaScript API v3를 사용합니다.
- 정보나루 Open API는 인증키가 필요합니다.
- 실데이터 검색은 `srchBooks -> libSrchByBook -> bookExist` 순서로 호출합니다.
- 위치를 먼저 선택해야 도서 검색과 지도 경로 계산이 시작됩니다.
- ETA와 추천 경로는 NAVER Directions 5 기준으로 계산합니다.
