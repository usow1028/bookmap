const EARTH_RADIUS_KM = 6371;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export function estimateTransitMinutes(distanceKm: number) {
  const transferBuffer = 8;
  const cityTravelSpeedKmh = 18;

  return Math.max(6, Math.round((distanceKm / cityTravelSpeedKmh) * 60 + transferBuffer));
}
