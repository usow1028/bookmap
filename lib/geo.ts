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

export function estimateWalkingMinutes(distanceKm: number) {
  const walkingSpeedKmh = 4.5;

  return Math.max(3, Math.round((distanceKm / walkingSpeedKmh) * 60));
}

export function estimateCyclingMinutes(distanceKm: number) {
  const cyclingSpeedKmh = 15;

  return Math.max(2, Math.round((distanceKm / cyclingSpeedKmh) * 60));
}

export function estimateDrivingMinutes(distanceKm: number) {
  const departureBuffer = 3;
  const cityDrivingSpeedKmh = 28;

  return Math.max(3, Math.round((distanceKm / cityDrivingSpeedKmh) * 60 + departureBuffer));
}

export function estimateTransitMinutes(distanceKm: number) {
  return estimateDrivingMinutes(distanceKm);
}
