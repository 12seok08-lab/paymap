// 오픈스트리트맵 Overpass API (키 없음): 이름으로 도로 선형을 가져온다
import type { Feature, LineString } from "geojson";

// 공개 서버는 요청 제한(429)이나 시간 초과가 잦아서 차례로 시도한다
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const TIMEOUT_MS = 15000;
// 남한 전체를 덮는 범위 (남, 서, 북, 동)
const KOREA_BBOX = "33.0,124.5,38.7,131.0";

type OverpassWay = {
  type: "way";
  id: number;
  geometry: { lat: number; lon: number }[];
};

export async function roadsNamed(name: string): Promise<Feature<LineString>[]> {
  const safe = name.replace(/["\\]/g, "");
  const query = `[out:json][timeout:25];way["highway"]["name"="${safe}"](${KOREA_BBOX});out geom;`;

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
      const json = (await res.json()) as { elements: OverpassWay[] };
      return json.elements
        .filter((e) => e.type === "way" && e.geometry?.length >= 2)
        .map((e) => ({
          type: "Feature",
          properties: { id: e.id },
          geometry: { type: "LineString", coordinates: e.geometry.map((p) => [p.lon, p.lat]) },
        }));
    } catch (e) {
      failures.push(`${new URL(endpoint).host} ${e instanceof Error ? e.name : "error"}`);
    }
  }
  throw new Error(`도로 정보 서버(Overpass)에 연결하지 못했습니다: ${failures.join(", ")}`);
}
