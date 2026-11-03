// 오픈스트리트맵 Nominatim (키 없음): 지명 → 좌표. 카카오 키가 없을 때 쓴다
// 이용 정책상 초당 1건 이하, User-Agent 필수
export async function geocode(query: string): Promise<{ lng: number; lat: number } | null> {
  const qs = new URLSearchParams({ q: query, format: "jsonv2", countrycodes: "kr", limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
    headers: {
      "User-Agent": "paymap (https://github.com/12seok08-lab/paymap)",
      "Accept-Language": "ko",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lng: Number(hit.lon), lat: Number(hit.lat) } : null;
}
