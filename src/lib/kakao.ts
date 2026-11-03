// 카카오 로컬 API: 장소 검색, 좌표→행정구역, 영역 내 음식점(FD6) 수집
const BASE = "https://dapi.kakao.com/v2/local";

export type KakaoPlace = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string; // 경도
  y: string; // 위도
  place_url: string;
};

type KakaoPage<T> = {
  meta: { total_count: number; pageable_count: number; is_end: boolean };
  documents: T[];
};

type RegionDoc = {
  region_type: "B" | "H";
  code: string;
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
};

// [minLng, minLat, maxLng, maxLat]
export type BBox = [number, number, number, number];

async function kakao<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY 가 없습니다");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kakao ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function searchKeyword(query: string): Promise<KakaoPlace[]> {
  const page = await kakao<KakaoPage<KakaoPlace>>("/search/keyword.json", { query, size: 5 });
  return page.documents;
}

export async function regionsAt(lng: number, lat: number) {
  const page = await kakao<{ documents: RegionDoc[] }>("/geo/coord2regioncode.json", {
    x: lng,
    y: lat,
  });
  return {
    h: page.documents.find((d) => d.region_type === "H"),
    b: page.documents.find((d) => d.region_type === "B"),
  };
}

// 카카오는 한 검색당 최대 45건(15건 × 3페이지)까지만 준다.
// 결과가 그보다 많으면 사각형을 4등분해서 다시 찾는다.
const MAX_PAGEABLE = 45;
const MAX_DEPTH = 6;

export async function restaurantsInBox(bbox: BBox, depth = 0): Promise<KakaoPlace[]> {
  const rect = bbox.join(",");
  const first = await kakao<KakaoPage<KakaoPlace>>("/search/category.json", {
    category_group_code: "FD6",
    rect,
    size: 15,
    page: 1,
  });

  if (first.meta.total_count > MAX_PAGEABLE && depth < MAX_DEPTH) {
    const [x1, y1, x2, y2] = bbox;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const quads: BBox[] = [
      [x1, y1, mx, my],
      [mx, y1, x2, my],
      [x1, my, mx, y2],
      [mx, my, x2, y2],
    ];
    return (await Promise.all(quads.map((q) => restaurantsInBox(q, depth + 1)))).flat();
  }

  const places = [...first.documents];
  for (let page = 2; page <= 3 && !first.meta.is_end && places.length < first.meta.pageable_count; page++) {
    const next = await kakao<KakaoPage<KakaoPlace>>("/search/category.json", {
      category_group_code: "FD6",
      rect,
      size: 15,
      page,
    });
    places.push(...next.documents);
    if (next.meta.is_end) break;
  }
  return places;
}
