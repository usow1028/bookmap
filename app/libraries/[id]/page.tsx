import Link from "next/link";
import { notFound } from "next/navigation";
import { books, holdingsByIsbn, libraries } from "@/lib/mock-data";

type LibraryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LibraryPage({ params }: LibraryPageProps) {
  const { id } = await params;
  const library = libraries.find((item) => item.id === id);

  if (!library) {
    notFound();
  }

  const holdings = books
    .map((book) => {
      const holding = (holdingsByIsbn[book.isbn13] ?? []).find(
        (candidate) => candidate.libraryId === library.id,
      );

      if (!holding) {
        return null;
      }

      return {
        ...book,
        ...holding,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <main className="page-shell detail-page">
      <section className="detail-hero">
        <div className="section-heading">
          <div>
            <div className="eyebrow">LIBRARY DETAIL</div>
            <h1>{library.name}</h1>
          </div>
          <Link className="text-link" href="/">
            홈으로
          </Link>
        </div>

        <div className="detail-grid">
          <article className="summary-card strong">
            <div className="eyebrow">도서관 정보</div>
            <h2>{library.district}</h2>
            <p>{library.address}</p>
            <p className="muted">운영 시간 {library.openHours}</p>
          </article>

          <article className="summary-card">
            <div className="eyebrow">외부 액션</div>
            <h2>바로 이동</h2>
            <p>
              <a className="text-link" href={library.homepage} target="_blank" rel="noreferrer">
                도서관 홈페이지 열기
              </a>
            </p>
            <p className="muted">예약과 대출은 기존 도서관 시스템으로 넘기는 정책을 유지합니다.</p>
          </article>
        </div>
      </section>

      <section className="surface-card holding-panel">
        <div className="section-heading">
          <div>
            <div className="eyebrow">소장 샘플</div>
            <h2>이 도서관에서 확인한 책</h2>
          </div>
        </div>

        <div className="holding-list">
          {holdings.map((holding) => (
            <article key={holding.isbn13} className="holding-card">
              <div>
                <h3>{holding.title}</h3>
                <p>{holding.author}</p>
              </div>
              <div>
                <strong>
                  {holding.loanAvailable ? "최근 수집 기준 대출 가능" : "최근 수집 기준 대출 불가"}
                </strong>
                <p>{holding.checkedAt}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
