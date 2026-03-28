import { UserLocation } from "@/lib/types";

const NAVER_MAP_IOS_APP_STORE_URL = "http://itunes.apple.com/app/id311867728?mt=8";
const WEB_MERCATOR_RADIUS = 6378137;

type NaverRouteMode = "car" | "walk" | "bicycle";

type NaverRoutePoint = {
  label: string;
  lat: number;
  lng: number;
};

type BuildNaverMapRouteUrlParams = {
  mode: NaverRouteMode;
  start: NaverRoutePoint;
  destination: NaverRoutePoint;
  appName: string;
};

function isAndroidDevice(userAgent: string) {
  return /Android/i.test(userAgent);
}

function isAppleMobileDevice(userAgent: string) {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

function isMobileDevice(userAgent: string) {
  return isAndroidDevice(userAgent) || isAppleMobileDevice(userAgent);
}

function normalizeLabel(label: string, fallback: string) {
  const trimmed = label.trim();

  return trimmed || fallback;
}

function buildRouteQuery(params: BuildNaverMapRouteUrlParams) {
  const searchParams = new URLSearchParams({
    slat: String(params.start.lat),
    slng: String(params.start.lng),
    sname: normalizeLabel(params.start.label, "출발지"),
    dlat: String(params.destination.lat),
    dlng: String(params.destination.lng),
    dname: normalizeLabel(params.destination.label, "도착지"),
    appname: params.appName,
  });

  return searchParams.toString();
}

function toWebMercator(value: { lat: number; lng: number }) {
  const latRadians = (value.lat * Math.PI) / 180;
  const lngRadians = (value.lng * Math.PI) / 180;

  return {
    x: WEB_MERCATOR_RADIUS * lngRadians,
    y: WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + latRadians / 2)),
  };
}

function buildWebRoutePathPoint(point: NaverRoutePoint) {
  const projected = toWebMercator(point);

  return `${projected.x},${projected.y},${encodeURIComponent(normalizeLabel(point.label, "장소"))},,ADDRESS_POI`;
}

export function buildNaverMapRouteSchemeUrl(params: BuildNaverMapRouteUrlParams) {
  return `nmap://route/${params.mode}?${buildRouteQuery(params)}`;
}

export function buildNaverMapRouteIntentUrl(params: BuildNaverMapRouteUrlParams) {
  return `intent://route/${params.mode}?${buildRouteQuery(params)}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
}

export function buildNaverMapRouteWebUrl(params: BuildNaverMapRouteUrlParams) {
  const start = buildWebRoutePathPoint(params.start);
  const destination = buildWebRoutePathPoint(params.destination);

  return `https://map.naver.com/p/directions/${start}/${destination}/-/${params.mode}`;
}

export function getNaverMapIosAppStoreUrl() {
  return NAVER_MAP_IOS_APP_STORE_URL;
}

export function toNaverRoutePoint(location: UserLocation) {
  return {
    label: location.label,
    lat: location.lat,
    lng: location.lng,
  };
}

export function openNaverMapRoute(params: {
  mode?: NaverRouteMode;
  start: UserLocation;
  destination: NaverRoutePoint;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const routeParams = {
    mode: params.mode ?? "car",
    start: toNaverRoutePoint(params.start),
    destination: params.destination,
    appName: window.location.origin || "bookmap",
  };
  const userAgent = window.navigator.userAgent;
  const webUrl = buildNaverMapRouteWebUrl(routeParams);

  if (isAndroidDevice(userAgent)) {
    window.location.href = buildNaverMapRouteIntentUrl(routeParams);
    return;
  }

  const schemeUrl = buildNaverMapRouteSchemeUrl(routeParams);

  if (isAppleMobileDevice(userAgent)) {
    const clickedAt = Date.now();
    window.location.href = schemeUrl;
    window.setTimeout(() => {
      if (Date.now() - clickedAt < 2000) {
        window.location.href = getNaverMapIosAppStoreUrl();
      }
    }, 1500);
    return;
  }

  if (!isMobileDevice(userAgent)) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return;
  }

  window.location.href = webUrl;
}
