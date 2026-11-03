import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

// 서버 전용(service role). API 라우트에서만 import 할 것
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase 환경변수가 없습니다 (.env.example 참고)");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
