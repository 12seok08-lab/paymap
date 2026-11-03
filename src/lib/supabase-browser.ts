import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

// 브라우저용(anon). statuses 실시간 구독에만 쓰인다.
// 환경변수가 없으면 null 을 돌려주고 화면은 실시간 반영 없이 동작한다
export function supabaseBrowser(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    client = url && key ? createClient(url, key) : null;
  }
  return client;
}
