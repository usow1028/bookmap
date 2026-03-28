"use client";

import { useEffect, useRef, useState } from "react";
import { SearchResult, UserLocation } from "@/lib/types";

type LibraryMapClientProps = {
  userLocation: UserLocation;
  results: SearchResult[];
};

export default function LibraryMapClient({
  userLocation,
  results,
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

    const bestRoute = results[0]?.routePath;

    if (bestRoute && bestRoute.length > 0) {
      const polyline = new naver.maps.Polyline({
        map,
        path: bestRoute.map((point) => new naver.maps.LatLng(point.lat, point.lng)),
        strokeColor: "#17354d",
        strokeWeight: 5,
        strokeOpacity: 0.8,
      });
      overlaysRef.current.push(polyline);
    }

    results.forEach((result, index) => {
      const position = new naver.maps.LatLng(result.library.lat, result.library.lng);
      bounds.extend(position);

      const marker = new naver.maps.Marker({
        map,
        position,
        title: result.library.name,
        icon: {
          content: `<div style="display:grid;place-items:center;width:${index === 0 ? 34 : 28}px;height:${index === 0 ? 34 : 28}px;border-radius:999px;background:${result.loanAvailable ? "#1f8f61" : "#24445f"};color:#fff;font-weight:800;font-size:${index === 0 ? 14 : 12}px;border:3px solid rgba(255,255,255,0.95);box-shadow:0 12px 26px rgba(23,53,77,0.25);">${index + 1}</div>`,
          anchor: new naver.maps.Point(index === 0 ? 17 : 14, index === 0 ? 17 : 14),
        },
      });

      const infoWindow = new naver.maps.InfoWindow({
        content: `
          <div style="padding:12px 14px;min-width:220px;font-family:SUIT Variable,Pretendard Variable,Apple SD Gothic Neo,Noto Sans KR,sans-serif;">
            <strong style="display:block;font-size:14px;margin-bottom:6px;">${result.library.name}</strong>
            <div style="font-size:12px;line-height:1.5;color:#4b5d70;">${result.library.address}</div>
            <div style="font-size:12px;line-height:1.5;color:#4b5d70;margin-top:6px;">${result.etaMinutes}분 · ${result.distanceKm.toFixed(1)}km</div>
          </div>
        `,
        borderWidth: 0,
        backgroundColor: "#fffdf9",
      });

      naver.maps.Event.addListener(marker, "click", () => {
        infoWindow.open(map, marker);
      });

      overlaysRef.current.push(marker, infoWindow);
    });

    if (results.length > 0) {
      map.fitBounds(bounds, {
        top: 48,
        right: 48,
        bottom: 48,
        left: 48,
      });
    } else {
      map.setZoom(14);
    }
  }, [results, sdkReady, userLocation]);

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
