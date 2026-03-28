export function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1)}km`;
}

export function formatEta(minutes: number) {
  if (minutes < 60) {
    return `${minutes}분`;
  }

  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;

  if (remain === 0) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${remain}분`;
}
