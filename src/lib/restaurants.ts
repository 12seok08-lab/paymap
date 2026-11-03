// 구역 안의 식당을 수집·캐시하고, 식당이 아닌 업종을 걸러낸다
import { bbox as turfBbox, booleanPointInPolygon, feature, point } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { classifyCategories } from "./gemini";
import { hasKakao, kakaoRestaurantsInBox, type BBox } from "./kakao";
import { osmRestaurantsInBox } from "./overpass";
import { supabaseAdmin } from "./supabase-server";
import type { Area, PayStatus, Restaurant } from "./types";

const CACHE_DAYS = 7;
const MAX_ROWS = 5000;

export async function restaurantsForArea(area: Area): Promise<Restaurant[]> {
  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("areas")
    .select("collected_at")
    .eq("key", area.key)
    .single();
  if (error) throw error;

  const fresh =
    row.collected_at &&
    Date.now() - new Date(row.collected_at).getTime() < CACHE_DAYS * 24 * 60 * 60 * 1000;
  const all = fresh ? await cachedRestaurants(area.key) : await collect(area);
  return keepRealRestaurants(all);
}

async function cachedRestaurants(areaKey: string): Promise<Restaurant[]> {
  const { data, error } = await supabaseAdmin()
    .from("area_restaurants")
    .select("restaurants(id, name, category, address, road_address, phone, lat, lng, place_url)")
    .eq("area_key", areaKey)
    .range(0, MAX_ROWS - 1);
  if (error) throw error;
  return (data as unknown as { restaurants: Restaurant }[]).map((r) => r.restaurants);
}

async function collect(area: Area): Promise<Restaurant[]> {
  const shape = feature(area.geom as Polygon | MultiPolygon);
  const box = turfBbox(shape) as BBox;
  // 카카오 키가 있으면 카카오(식당 정보가 풍부), 없으면 오픈스트리트맵
  const found = hasKakao() ? await kakaoRestaurantsInBox(box) : await osmRestaurantsInBox(box);

  const byId = new Map<string, Restaurant>();
  for (const r of found) {
    if (booleanPointInPolygon(point([r.lng, r.lat]), shape)) byId.set(r.id, r);
  }
  const restaurants = [...byId.values()];

  const db = supabaseAdmin();
  if (restaurants.length) {
    const now = new Date().toISOString();
    const { error } = await db
      .from("restaurants")
      .upsert(restaurants.map((r) => ({ ...r, updated_at: now })));
    if (error) throw error;
  }
  const { error: delError } = await db.from("area_restaurants").delete().eq("area_key", area.key);
  if (delError) throw delError;
  if (restaurants.length) {
    const { error } = await db
      .from("area_restaurants")
      .insert(restaurants.map((r) => ({ area_key: area.key, restaurant_id: r.id })));
    if (error) throw error;
  }
  const { error: areaError } = await db
    .from("areas")
    .update({ collected_at: new Date().toISOString() })
    .eq("key", area.key);
  if (areaError) throw areaError;

  return restaurants;
}

// 판정이 없는 업종만 Gemini 에 묻고 결과를 저장해 둔다
async function keepRealRestaurants(restaurants: Restaurant[]): Promise<Restaurant[]> {
  const categories = [...new Set(restaurants.map((r) => r.category))];
  if (!categories.length) return [];

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("category_verdicts")
    .select("category, is_restaurant")
    .in("category", categories);
  if (error) throw error;
  const verdicts = new Map<string, boolean>(
    (data as { category: string; is_restaurant: boolean }[]).map((v) => [v.category, v.is_restaurant]),
  );

  const unknown = categories.filter((c) => !verdicts.has(c));
  if (unknown.length) {
    const decided = await classifyCategories(unknown);
    const rows = unknown
      .filter((c) => c in decided)
      .map((c) => ({ category: c, is_restaurant: decided[c] }));
    rows.forEach((r) => verdicts.set(r.category, r.is_restaurant));
    if (rows.length) {
      const { error: upError } = await db.from("category_verdicts").upsert(rows);
      if (upError) throw upError;
    }
  }

  // 판정을 못 받은 업종은 일단 보여준다 (수집 단계에서 이미 음식점만 골랐으므로)
  return restaurants.filter((r) => verdicts.get(r.category) ?? true);
}

export async function statusesFor(ids: string[]): Promise<Record<string, PayStatus>> {
  const out: Record<string, PayStatus> = {};
  const db = supabaseAdmin();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db
      .from("statuses")
      .select("restaurant_id, status")
      .in("restaurant_id", ids.slice(i, i + 300));
    if (error) throw error;
    for (const s of data as { restaurant_id: string; status: PayStatus }[]) {
      out[s.restaurant_id] = s.status;
    }
  }
  return out;
}
