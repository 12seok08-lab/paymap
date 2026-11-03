import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

type Body = { restaurantId?: string; status?: string };

// 가장 최근 응답이 이긴다: 식당당 한 줄을 덮어쓴다
export async function POST(req: Request) {
  const { restaurantId, status } = (await req.json()) as Body;
  if (!restaurantId || (status !== "available" && status !== "unavailable")) {
    return NextResponse.json({ message: "잘못된 요청입니다" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: exists, error: findError } = await db
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (findError) {
    console.error(findError);
    return NextResponse.json({ message: findError.message }, { status: 500 });
  }
  if (!exists) return NextResponse.json({ message: "없는 식당입니다" }, { status: 404 });

  const { error } = await db
    .from("statuses")
    .upsert({ restaurant_id: restaurantId, status, updated_at: new Date().toISOString() });
  if (error) {
    console.error(error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
