// 카카오 로컬 API (선택): 장소 검색, 영역 내 음식점(FD6) 수집.
// KAKAO_REST_API_KEY 가 없으면 오픈스트리트맵으로 대신한다
import type { Restaurant } from "./types";

const BASE = "https://dapi.kakao.com/v2/local";

type KakaoPlace = {
  id: string;
  place_name: string;
  category_name: string;
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

// [minLng, minLat, maxLng, maxLat]
export type BBox = [number, number, number, number];

export function hasKakao(): boolean {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

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

export async function kakaoGeocode(query: string): Promise<{ lng: number; lat: number } | null> {
  const page = await kakao<KakaoPage<KakaoPlace>>("/search/keyword.json", { query, size: 1 });
  const [place] = page.documents;
  return place ? { lng: Number(place.x), lat: Number(place.y) } : null;
}

function toRestaurant(p: KakaoPlace): Restaurant {
  return {
    id: p.id,
    name: p.place_name,
    category: p.category_name,
    address: p.address_name || null,
    road_address: p.road_address_name || null,
    phone: p.phone || null,
    lat: Number(p.y),
    lng: Number(p.x),
    place_url: p.place_url || null,
  };
}

// 카카오는 한 검색당 최대 45건(15건 × 3페이지)까지만 준다.
// 결과가 그보다 많으면 사각형을 4등분해서 다시 찾는다.
const MAX_PAGEABLE = 45;
const MAX_DEPTH = 6;

export async function kakaoRestaurantsInBox(bbox: BBox, depth = 0): Promise<Restaurant[]> {
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
    return (await Promise.all(quads.map((q) => kakaoRestaurantsInBox(q, depth + 1)))).flat();
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
  return places.map(toRestaurant);
}
