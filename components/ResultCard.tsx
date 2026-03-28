import Link from "next/link";
import { SearchResult } from "@/lib/types";
import { formatDistance, formatEta } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";

type ResultCardProps = {
  rank: number;
  result: SearchResult;
};

export function ResultCard({ rank, result }: ResultCardProps) {
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${result.library.lat},${result.library.lng}`;

  return (
    <article className="result-card">
      <div className="result-card-top">
        <div>
          <div className="eyebrow">추천 {rank}</div>
          <h3>{result.library.name}</h3>
        </div>
        <div className="score-badge">{result.score}</div>
      </div>

      <div className="status-row">
        <StatusPill tone={result.loanAvailable ? "available" : "unavailable"}>
          {result.loanAvailable ? "최근 수집 기준 대출 가능" : "최근 수집 기준 대출 불가"}
        </StatusPill>
        <StatusPill tone="neutral">{formatEta(result.etaMinutes)}</StatusPill>
        <StatusPill tone="neutral">{formatDistance(result.distanceKm)}</StatusPill>
      </div>

      <p className="result-address">{result.library.address}</p>

      <dl className="meta-grid">
        <div>
          <dt>운영 시간</dt>
          <dd>{result.library.openHours}</dd>
        </div>
        <div>
          <dt>생활권</dt>
          <dd>{result.library.district}</dd>
        </div>
        <div>
          <dt>확인 기준</dt>
          <dd>{result.checkedAt}</dd>
        </div>
        <div>
          <dt>소장 상태</dt>
          <dd>{result.hasBook ? "소장 확인" : "미확인"}</dd>
        </div>
      </dl>

      <div className="action-row">
        <Link className="text-link" href={`/libraries/${result.library.id}`}>
          상세 보기
        </Link>
        <a className="text-link" href={result.library.homepage} target="_blank" rel="noreferrer">
          도서관 홈페이지
        </a>
        <a className="primary-inline-link" href={routeUrl} target="_blank" rel="noreferrer">
          길찾기
        </a>
      </div>
    </article>
  );
}
