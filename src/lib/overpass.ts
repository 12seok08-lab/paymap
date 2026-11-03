// 오픈스트리트맵 Overpass API (키 없음): 도로 선형과 식당을 가져온다
import type { Feature, LineString } from "geojson";
import type { Restaurant } from "./types";

// 공개 서버는 요청 제한(429)이나 시간 초과가 잦아서 차례로 시도한다
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const TIMEOUT_MS = 20000;
// 남한 전체를 덮는 범위 (남, 서, 북, 동)
const KOREA_BBOX = "33.0,124.5,38.7,131.0";

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

async function overpass(query: string): Promise<OsmElement[]> {
  const failures: string[] = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "paymap (https://github.com/12seok08-lab/paymap)",
        },
        body: new URLSearchParams({ data: query }),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        failures.push(`${new URL(endpoint).host} ${res.status}`);
        continue;
      }
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } catch (e) {
      failures.push(`${new URL(endpoint).host} ${e instanceof Error ? e.name : "error"}`);
    }
  }
  throw new Error(`오픈스트리트맵 서버(Overpass)에 연결하지 못했습니다: ${failures.join(", ")}`);
}

export async function roadsNamed(name: string): Promise<Feature<LineString>[]> {
  const safe = name.replace(/["\\]/g, "");
  const elements = await overpass(
    `[out:json][timeout:25];way["highway"]["name"="${safe}"](${KOREA_BBOX});out geom;`,
  );
  return elements
    .filter((e) => e.type === "way" && (e.geometry?.length ?? 0) >= 2)
    .map((e) => ({
      type: "Feature",
      properties: { id: e.id },
      geometry: { type: "LineString", coordinates: e.geometry!.map((p) => [p.lon, p.lat]) },
    }));
}

const AMENITY_KO: Record<string, string> = {
  restaurant: "식당",
  fast_food: "패스트푸드",
  food_court: "푸드코트",
};

const CUISINE_KO: Record<string, string> = {
  korean: "한식",
  japanese: "일식",
  sushi: "일식",
  ramen: "일식",
  chinese: "중식",
  italian: "양식",
  pizza: "양식",
  burger: "패스트푸드",
  western: "양식",
  american: "양식",
  french: "양식",
  vietnamese: "아시아음식",
  thai: "아시아음식",
  indian: "아시아음식",
  chicken: "치킨",
  bbq: "고기",
  barbecue: "고기",
  noodle: "면요리",
  seafood: "해산물",
};

// 카카오 업종명과 같은 "음식점 > 대분류 > 소분류" 꼴로 맞춰 Gemini 판정과 음식 종류 검색을 재사용한다
function osmCategory(tags: Record<string, string>): string {
  const kind = AMENITY_KO[tags.amenity] ?? "식당";
  const cuisines = (tags.cuisine ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => CUISINE_KO[c] ?? c);
  return `음식점 > ${cuisines[0] ?? kind}${cuisines.length > 1 ? ` > ${cuisines.slice(1).join(",")}` : ""}`;
}

// [minLng, minLat, maxLng, maxLat]
export async function osmRestaurantsInBox(bbox: [number, number, number, number]): Promise<Restaurant[]> {
  const [w, s, e, n] = bbox;
  const area = `(${s},${w},${n},${e})`;
  const filter = `["amenity"~"^(restaurant|fast_food|food_court)$"]["name"]`;
  const elements = await overpass(
    `[out:json][timeout:25];(node${filter}${area};way${filter}${area};);out center tags;`,
  );

  return elements.flatMap((el) => {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) return [];
    const street = [tags["addr:city"], tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(" ");
    return [
      {
        id: `osm:${el.type}/${el.id}`,
        name: tags["name:ko"] ?? tags.name,
        category: osmCategory(tags),
        address: tags["addr:full"] ?? null,
        road_address: street || null,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        lat,
        lng,
        place_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      },
    ];
  });
}
