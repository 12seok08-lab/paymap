// 입력(동 이름 / 도로명 / 지명)을 지도 위의 구역(다각형)으로 바꾼다
import { bbox as turfBbox, buffer, multiLineString } from "@turf/turf";
import type { Feature, Geometry, LineString } from "geojson";
import { regionsAt, searchKeyword } from "./kakao";
import { roadsNamed } from "./overpass";
import { supabaseAdmin } from "./supabase-server";
import type { Area, AreaCandidate } from "./types";

export type Resolution =
  | { type: "area"; area: Area }
  | { type: "candidates"; candidates: AreaCandidate[] }
  | { type: "notFound" };

const ROAD_BUFFER_METERS = 50;
// 같은 이름의 도로 조각이 이 거리(도 단위, 약 1km) 안에 있으면 한 도로로 본다
const ROAD_JOIN_DEGREES = 0.01;

export async function resolveArea(input: string): Promise<Resolution> {
  const name = input.replace(/\s+/g, "");
  if (!name) return { type: "notFound" };

  if (/(동|가|읍|면)$/.test(name)) {
    const found = await dongsNamed(name);
    if (found.length) return finish(found);
  }

  if (/(로|길)$/.test(name)) {
    const found = await roadAreas(name);
    if (found.length) return finish(found);
  }

  // 지명(역, 건물, 상권 등): 카카오로 위치를 찾고 그 위치의 행정동을 구역으로 쓴다
  const [place] = await searchKeyword(name);
  if (!place) return { type: "notFound" };
  const { h } = await regionsAt(Number(place.x), Number(place.y));
  if (!h) return { type: "notFound" };
  const dong = await dongByCode(h.code);
  return dong ? finish([dong]) : { type: "notFound" };
}

export async function getAreaByKey(key: string): Promise<Area | null> {
  const { data, error } = await supabaseAdmin()
    .from("areas")
    .select("key, kind, label, geom")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data as Area | null;
}

async function finish(areas: Area[]): Promise<Resolution> {
  // 후보도 저장해 두면 사용자가 고른 key 로 바로 불러올 수 있다
  const { error } = await supabaseAdmin().from("areas").upsert(areas);
  if (error) throw error;
  if (areas.length === 1) return { type: "area", area: areas[0] };
  return { type: "candidates", candidates: areas.map(({ key, label }) => ({ key, label })) };
}

type DongRow = { code: string; full_name: string; geom: Geometry };

function dongToArea(row: DongRow): Area {
  return { key: `dong:${row.code}`, kind: "dong", label: row.full_name, geom: row.geom };
}

async function dongsNamed(name: string): Promise<Area[]> {
  const { data, error } = await supabaseAdmin()
    .from("admdong")
    .select("code, full_name, geom")
    .eq("name", name)
    .limit(30);
  if (error) throw error;
  return (data as DongRow[]).map(dongToArea);
}

async function dongByCode(code: string): Promise<Area | null> {
  const { data, error } = await supabaseAdmin()
    .from("admdong")
    .select("code, full_name, geom")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data ? dongToArea(data as DongRow) : null;
}

// 같은 이름의 도로가 여러 도시에 있을 수 있으므로(예: 중앙대로)
// 가까운 조각끼리 묶고, 묶음마다 시군구를 붙여 후보로 만든다
async function roadAreas(name: string): Promise<Area[]> {
  // 도로 모양은 거의 바뀌지 않으므로 한 번 만든 구역은 DB 에서 재사용한다
  const { data: saved, error } = await supabaseAdmin()
    .from("areas")
    .select("key, kind, label, geom")
    .like("key", `road:${name}:%`);
  if (error) throw error;
  if (saved.length) return saved as Area[];

  const ways = await roadsNamed(name);
  if (!ways.length) return [];

  const groups = clusterWays(ways);
  const bySgg = new Map<string, { label: string; lines: Feature<LineString>[] }>();
  for (const group of groups) {
    const [lng, lat] = group[0].geometry.coordinates[0];
    const { b } = await regionsAt(lng, lat);
    const sgg = b?.code.slice(0, 5) ?? `${lng.toFixed(2)},${lat.toFixed(2)}`;
    const label = b ? `${b.region_1depth_name} ${b.region_2depth_name} ${name}` : name;
    const entry = bySgg.get(sgg) ?? { label, lines: [] };
    entry.lines.push(...group);
    bySgg.set(sgg, entry);
  }

  return [...bySgg.entries()].map(([sgg, { label, lines }]) => {
    const merged = multiLineString(lines.map((l) => l.geometry.coordinates));
    const area = buffer(merged, ROAD_BUFFER_METERS, { units: "meters" });
    if (!area) throw new Error(`도로 구역을 만들지 못했습니다: ${label}`);
    return { key: `road:${name}:${sgg}`, kind: "road" as const, label, geom: area.geometry };
  });
}

function clusterWays(ways: Feature<LineString>[]): Feature<LineString>[][] {
  const boxes = ways.map((w) => turfBbox(w));
  const parent = ways.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = (a: number[], b: number[]) =>
    a[0] - ROAD_JOIN_DEGREES <= b[2] &&
    b[0] - ROAD_JOIN_DEGREES <= a[2] &&
    a[1] - ROAD_JOIN_DEGREES <= b[3] &&
    b[1] - ROAD_JOIN_DEGREES <= a[3];

  for (let i = 0; i < ways.length; i++) {
    for (let j = i + 1; j < ways.length; j++) {
      if (near(boxes[i], boxes[j])) parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, Feature<LineString>[]>();
  ways.forEach((w, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), w]);
  });
  return [...groups.values()];
}
