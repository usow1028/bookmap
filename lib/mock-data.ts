import { BookCandidate, LibraryHolding, LibraryRecord, UserLocation } from "@/lib/types";

export const defaultLocation: UserLocation = {
  label: "서울 성수동",
  lat: 37.54493,
  lng: 127.05503,
};

export const sampleLocations: UserLocation[] = [
  defaultLocation,
  {
    label: "서울 광화문",
    lat: 37.57588,
    lng: 126.97687,
  },
  {
    label: "서울 잠실",
    lat: 37.51326,
    lng: 127.10013,
  },
];

export const books: BookCandidate[] = [
  {
    isbn13: "9788936434123",
    title: "불편한 편의점",
    author: "김호연",
    publisher: "나무옆의자",
    synopsis: "서울역 인근 편의점을 배경으로 서로 다른 사연을 가진 인물들이 관계를 회복해 가는 소설.",
    tags: ["소설", "한국문학", "베스트셀러"],
    coverUrl: "https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/9788936434123.jpg",
  },
  {
    isbn13: "9788932473904",
    title: "아몬드",
    author: "손원평",
    publisher: "창비",
    synopsis: "감정을 느끼기 어려운 주인공이 관계와 사건을 겪으며 성장하는 청소년 소설.",
    tags: ["소설", "청소년", "성장"],
    coverUrl: "https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/9788932473904.jpg",
  },
  {
    isbn13: "9788934985061",
    title: "사피엔스",
    author: "유발 하라리",
    publisher: "김영사",
    synopsis: "인류의 역사를 거시적으로 설명하는 대중 인문서.",
    tags: ["인문", "역사", "논픽션"],
    coverUrl: "https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/9788934985061.jpg",
  },
  {
    isbn13: "9788937437567",
    title: "클린 코드",
    author: "로버트 C. 마틴",
    publisher: "인사이트",
    synopsis: "유지보수 가능한 소프트웨어를 위한 실천적인 코딩 원칙을 다룬 개발서.",
    tags: ["개발", "프로그래밍", "소프트웨어"],
    coverUrl: "https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/9788937437567.jpg",
  },
];

export const libraries: LibraryRecord[] = [
  {
    id: "lib-seongsu",
    name: "성동구립 성수도서관",
    address: "서울 성동구 뚝섬로1길 43",
    lat: 37.54464,
    lng: 127.05771,
    homepage: "https://sdlib.or.kr",
    openHours: "09:00 - 22:00",
    district: "성동구",
  },
  {
    id: "lib-gwangjin",
    name: "광진정보도서관",
    address: "서울 광진구 아차산로78길 90",
    lat: 37.55027,
    lng: 127.09222,
    homepage: "https://www.gwangjinlib.seoul.kr",
    openHours: "09:00 - 22:00",
    district: "광진구",
  },
  {
    id: "lib-songpa",
    name: "송파글마루도서관",
    address: "서울 송파구 송파대로 345",
    lat: 37.50337,
    lng: 127.11118,
    homepage: "https://www.splib.or.kr",
    openHours: "09:00 - 22:00",
    district: "송파구",
  },
  {
    id: "lib-jongno",
    name: "종로도서관",
    address: "서울 종로구 사직로9길 15-14",
    lat: 37.57546,
    lng: 126.96842,
    homepage: "https://jnlib.sen.go.kr",
    openHours: "07:00 - 23:00",
    district: "종로구",
  },
  {
    id: "lib-mapo",
    name: "마포중앙도서관",
    address: "서울 마포구 성산로 128",
    lat: 37.56342,
    lng: 126.90999,
    homepage: "https://mplib.mapo.go.kr",
    openHours: "09:00 - 22:00",
    district: "마포구",
  },
];

export const holdingsByIsbn: Record<string, LibraryHolding[]> = {
  "9788936434123": [
    {
      libraryId: "lib-seongsu",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-gwangjin",
      hasBook: true,
      loanAvailable: false,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-jongno",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
  ],
  "9788932473904": [
    {
      libraryId: "lib-seongsu",
      hasBook: true,
      loanAvailable: false,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-songpa",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-mapo",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
  ],
  "9788934985061": [
    {
      libraryId: "lib-jongno",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-mapo",
      hasBook: true,
      loanAvailable: false,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-gwangjin",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
  ],
  "9788937437567": [
    {
      libraryId: "lib-seongsu",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
    {
      libraryId: "lib-songpa",
      hasBook: true,
      loanAvailable: true,
      checkedAt: "2026-03-26 23:00",
    },
  ],
};
