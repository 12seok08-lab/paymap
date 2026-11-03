// 행정동 경계(vuski/admdongkor)를 받아 Supabase admdong 테이블에 넣는다.
// 사용법: .env.local 을 채운 뒤 `npm run seed:admdong`
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local" });

const VERSION = "ver20261001";
const URL = `https://raw.githubusercontent.com/vuski/admdongkor/master/${VERSION}/HangJeongDong_${VERSION}.geojson`;
const FILE = `data/HangJeongDong_${VERSION}.geojson`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error(".env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 넣어주세요.");
  process.exit(1);
}

if (!existsSync(FILE)) {
  console.log(`다운로드: ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, Buffer.from(await res.arrayBuffer()));
}

const { features } = JSON.parse(readFileSync(FILE, "utf8"));
const rows = features.map((f) => ({
  code: f.properties.adm_cd2,
  name: f.properties.adm_nm.split(" ").at(-1),
  full_name: f.properties.adm_nm,
  geom: f.geometry,
}));

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const BATCH = 100;
for (let i = 0; i < rows.length; i += BATCH) {
  const { error } = await supabase.from("admdong").upsert(rows.slice(i, i + BATCH));
  if (error) throw error;
  process.stdout.write(`\r${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
}
console.log("\n완료");
