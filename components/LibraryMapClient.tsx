"use client";

import { useEffect, useRef, useState } from "react";
import { getDistanceKm } from "@/lib/geo";
import { openNaverMapRoute } from "@/lib/naver-map-app";
import { SearchResult, UserLocation } from "@/lib/types";

type LibraryMapClientProps = {
  userLocation: UserLocation;
  results: SearchResult[];
  selectedLibraryId?: string | null;
  onSelectLibrary?: (libraryId: string) => void;
};

type ViewportOptions = {
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  maxZoom: number;
};

function getRouteCenterPoint(userLocation: UserLocation, result: SearchResult) {
  const path = result.routePath;

  if (!path || path.length === 0) {
    return {
      lat: (userLocation.lat + result.library.lat) / 2,
      lng: (userLocation.lng + result.library.lng) / 2,
    };
  }

  if (path.length === 1) {
    return path[0];
  }

  const segments = path.slice(1).map((point, index) => ({
    start: path[index],
    end: point,
    distanceKm: getDistanceKm(path[index], point),
  }));
  const totalDistanceKm = segments.reduce((sum, segment) => sum + segment.distanceKm, 0);

  if (totalDistanceKm <= 0) {
    return path[Math.floor(path.length / 2)] ?? path[0];
  }

  const midpointKm = totalDistanceKm / 2;
  let traversedKm = 0;

  for (const segment of segments) {
    if (traversedKm + segment.distanceKm >= midpointKm) {
      const ratio =
        segment.distanceKm === 0 ? 0 : (midpointKm - traversedKm) / segment.distanceKm;

      return {
        lat: segment.start.lat + (segment.end.lat - segment.start.lat) * ratio,
        lng: segment.start.lng + (segment.end.lng - segment.start.lng) * ratio,
      };
    }

    traversedKm += segment.distanceKm;
  }

  return path[path.length - 1];
}

function buildFocusedBounds(naver: any, userLocation: UserLocation, result: SearchResult) {
  const bounds = new naver.maps.LatLngBounds();
  const path = result.routePath ?? [];

  bounds.extend(new naver.maps.LatLng(userLocation.lat, userLocation.lng));
  bounds.extend(new naver.maps.LatLng(result.library.lat, result.library.lng));

  path.forEach((point) => {
    bounds.extend(new naver.maps.LatLng(point.lat, point.lng));
  });

  return bounds;
}

function getViewportOptions(distanceKm: number): ViewportOptions {
  if (distanceKm <= 1.2) {
    return {
      margin: {
        top: 160,
        right: 160,
        bottom: 180,
        left: 160,
      },
      maxZoom: 16,
    };
  }

  if (distanceKm <= 3) {
    return {
      margin: {
        top: 136,
        right: 136,
        bottom: 156,
        left: 136,
      },
      maxZoom: 15,
    };
  }

  if (distanceKm <= 8) {
    return {
      margin: {
        top: 112,
        right: 112,
        bottom: 132,
        left: 112,
      },
      maxZoom: 14,
    };
  }

  return {
    margin: {
      top: 72,
      right: 72,
      bottom: 96,
      left: 72,
    },
    maxZoom: 13,
  };
}

function buildRouteButtonContent() {
  return `
    <div style="position:relative;transform:translate(-50%,-100%);display:inline-flex;flex-direction:column;align-items:center;">
      <button
        type="button"
        style="
          border:2px solid rgba(255,255,255,0.92);
          border-radius:999px;
          background:#03c75a;
          color:#fff;
          padding:11px 18px;
          font:800 13px/1 SUIT Variable,Pretendard Variable,Apple SD Gothic Neo,Noto Sans KR,sans-serif;
          box-shadow:0 18px 34px rgba(3,199,90,0.24);
          white-space:nowrap;
          cursor:pointer;
        "
      >
        네이버 지도
      </button>
      <span
        style="
          width:0;
          height:0;
          margin-top:-1px;
          border-left:10px solid transparent;
          border-right:10px solid transparent;
          border-top:12px solid #03c75a;
          filter:drop-shadow(0 6px 10px rgba(3,199,90,0.2));
        "
      ></span>
    </div>
  `;
}

function createRouteActionOverlay(
  naver: any,
  params: {
    position: { lat: number; lng: number };
    onClick: () => void;
  },
) {
  let root: HTMLDivElement | null = document.createElement("div");
  root.style.position = "absolute";
  root.style.left = "0";
  root.style.top = "0";
  root.style.zIndex = "450";
  root.style.pointerEvents = "auto";
  root.innerHTML = buildRouteButtonContent();

  const button = root.querySelector("button");
  const handleClick = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    params.onClick();
  };
  button?.addEventListener("click", handleClick);

  const overlay = new naver.maps.OverlayView();

  overlay.onAdd = function onAdd() {
    const panes = this.getPanes();
    (panes.floatPane ?? panes.overlayLayer).appendChild(root as HTMLDivElement);
  };

  overlay.draw = function draw() {
    if (!root) {
      return;
    }

    const projection = this.getProjection();

    if (!projection) {
      return;
    }

    const offset = projection.fromCoordToOffset(
      new naver.maps.LatLng(params.position.lat, params.position.lng),
    );

    root.style.left = `${offset.x}px`;
    root.style.top = `${offset.y}px`;
  };

  overlay.onRemove = function onRemove() {
    if (button) {
      button.removeEventListener("click", handleClick);
    }

    root?.remove();
    root = null;
  };

  return overlay;
}

export default function LibraryMapClient({
  userLocation,
  results,
  selectedLibraryId,
  onSelectLibrary,
}: LibraryMapClientProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    const hasMapSdk = () => Boolean((window as Window & { naver?: any }).naver?.maps);

    if (hasMapSdk()) {
      setSdkReady(true);
      return;
    }

    const intervalId = window.setInterval(() => {
      if (hasMapSdk()) {
        setSdkReady(true);
        window.clearInterval(intervalId);
      }
    }, 150);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const naver = (window as Window & { naver?: any }).naver;

    if (!sdkReady || !mapElementRef.current || !naver?.maps) {
      return;
    }

    const center = new naver.maps.LatLng(userLocation.lat, userLocation.lng);
    const focusedResult = results.find((result) => result.library.id === selectedLibraryId) ?? results[0] ?? null;
    const zoomClampTimerIds: number[] = [];

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new naver.maps.Map(mapElementRef.current, {
        center,
        zoom: results.length > 0 ? 13 : 14,
        zoomControl: true,
        scaleControl: false,
        logoControl: false,
        mapDataControl: false,
      });
    }

    const map = mapInstanceRef.current;
    map.setCenter(center);

    overlaysRef.current.forEach((overlay) => {
      if (overlay?.setMap) {
        overlay.setMap(null);
      }
    });
    overlaysRef.current = [];

    const bounds = new naver.maps.LatLngBounds();
    bounds.extend(center);

    const userMarker = new naver.maps.Marker({
      map,
      position: center,
      icon: {
        content:
          '<div style="width:18px;height:18px;border-radius:999px;background:#ff6a3d;border:3px solid rgba(255,255,255,0.92);box-shadow:0 10px 24px rgba(255,106,61,0.32);"></div>',
        anchor: new naver.maps.Point(9, 9),
      },
      zIndex: 200,
    });
    overlaysRef.current.push(userMarker);

    if (typeof userLocation.accuracyMeters === "number" && userLocation.accuracyMeters > 0) {
      const userCircle = new naver.maps.Circle({
        map,
        center,
        radius: userLocation.accuracyMeters,
        strokeColor: "#ff6a3d",
        strokeOpacity: 0.55,
        strokeWeight: 2,
        fillColor: "#ff6a3d",
        fillOpacity: 0.12,
      });
      overlaysRef.current.push(userCircle);
    }

    if (focusedResult?.routePath && focusedResult.routePath.length > 0) {
      const polyline = new naver.maps.Polyline({
        map,
        path: focusedResult.routePath.map((point) => new naver.maps.LatLng(point.lat, point.lng)),
        strokeColor: "#17354d",
        strokeWeight: 5,
        strokeOpacity: 0.84,
      });
      overlaysRef.current.push(polyline);
    }

    if (focusedResult) {
      const routeCenterPoint = getRouteCenterPoint(userLocation, focusedResult);
      const routeActionOverlay = createRouteActionOverlay(naver, {
        position: routeCenterPoint,
        onClick: () => {
          openNaverMapRoute({
            start: userLocation,
            destination: {
              label: focusedResult.library.name,
              lat: focusedResult.library.lat,
              lng: focusedResult.library.lng,
            },
          });
        },
      });

      routeActionOverlay.setMap(map);
      overlaysRef.current.push(routeActionOverlay);
    }

    results.forEach((result, index) => {
      const isSelected = result.library.id === focusedResult?.library.id;
      const position = new naver.maps.LatLng(result.library.lat, result.library.lng);
      bounds.extend(position);
      const markerFill = result.availabilityChecked ? "#17354d" : "#8f5b00";

      const marker = new naver.maps.Marker({
        map,
        position,
        title: result.library.name,
        icon: {
          content: `<div style="display:grid;place-items:center;width:${isSelected ? 40 : index === 0 ? 34 : 28}px;height:${isSelected ? 40 : index === 0 ? 34 : 28}px;border-radius:999px;background:${markerFill};color:#fff;font-weight:800;font-size:${isSelected ? 15 : index === 0 ? 14 : 12}px;border:${isSelected ? 4 : 3}px solid ${isSelected ? "rgba(255,106,61,0.95)" : "rgba(255,255,255,0.95)"};box-shadow:0 12px 26px rgba(23,53,77,0.25);">${index + 1}</div>`,
          anchor: new naver.maps.Point(isSelected ? 20 : index === 0 ? 17 : 14, isSelected ? 20 : index === 0 ? 17 : 14),
        },
        zIndex: isSelected ? 300 : 100 + index,
      });

      naver.maps.Event.addListener(marker, "click", () => {
        onSelectLibrary?.(result.library.id);
      });

      overlaysRef.current.push(marker);
    });

    if (focusedResult) {
      const focusedBounds = buildFocusedBounds(naver, userLocation, focusedResult);
      const viewportOptions = getViewportOptions(focusedResult.distanceKm);

      map.fitBounds(focusedBounds, {
        ...viewportOptions.margin,
        maxZoom: viewportOptions.maxZoom,
      });

      zoomClampTimerIds.push(
        window.setTimeout(() => {
          if (map.getZoom() > viewportOptions.maxZoom) {
            map.morph(map.getCenter(), viewportOptions.maxZoom);
          }
        }, 120),
      );
    } else if (results.length > 0) {
      map.fitBounds(bounds, {
        top: 72,
        right: 72,
        bottom: 96,
        left: 72,
        maxZoom: 13,
      });
    } else {
      map.setZoom(14);
    }

    return () => {
      zoomClampTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [onSelectLibrary, results, sdkReady, selectedLibraryId, userLocation]);

  return (
    <div className="map-shell">
      {!sdkReady ? <div className="map-loading">지도를 준비하는 중입니다...</div> : null}
      <div
        ref={mapElementRef}
        className="map-canvas naver-map-canvas"
        style={{ display: sdkReady ? "block" : "none" }}
      />
    </div>
  );
}
