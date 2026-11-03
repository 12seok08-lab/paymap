import { NextResponse } from "next/server";
import { getAreaByKey, resolveArea } from "@/lib/area";
import { matchCuisine, parseQuery } from "@/lib/gemini";
import { restaurantsForArea, statusesFor } from "@/lib/restaurants";
import type { SearchResponse } from "@/lib/types";

// 처음 보는 구역은 카카오 수집 때문에 시간이 걸린다
export const maxDuration = 60;

type Body = { q?: string; areaKey?: string; cuisine?: string };

export async function POST(req: Request): Promise<NextResponse<SearchResponse>> {
  try {
    const body = (await req.json()) as Body;
    let cuisine = body.cuisine ?? "";
    let area;

    if (body.areaKey) {
      area = await getAreaByKey(body.areaKey);
      if (!area) return NextResponse.json({ type: "error", message: "구역을 찾을 수 없습니다" }, { status: 404 });
    } else {
      const q = body.q?.trim();
      if (!q) return NextResponse.json({ type: "error", message: "검색어를 입력하세요" }, { status: 400 });

      // "을지로" 처럼 한 단어면 바로 찾고, 문장이면 Gemini 가 지역과 음식 종류를 뽑는다
      const parsed = /\s/.test(q) ? await parseQuery(q) : { place: q, cuisine: "" };
      cuisine = parsed.cuisine;

      const resolved = await resolveArea(parsed.place);
      if (resolved.type === "notFound") {
        return NextResponse.json({ type: "error", message: `"${parsed.place}" 구역을 찾지 못했습니다` }, { status: 404 });
      }
      if (resolved.type === "candidates") {
        return NextResponse.json({ type: "candidates", candidates: resolved.candidates, cuisine });
      }
      area = resolved.area;
    }

    let restaurants = await restaurantsForArea(area);
    if (cuisine && restaurants.length) {
      const matches = new Set(
        await matchCuisine(cuisine, [...new Set(restaurants.map((r) => r.category))]),
      );
      restaurants = restaurants.filter((r) => matches.has(r.category));
    }
    const statuses = await statusesFor(restaurants.map((r) => r.id));

    return NextResponse.json({ type: "result", area, cuisine, restaurants, statuses });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ type: "error", message }, { status: 500 });
  }
}
