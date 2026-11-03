-- paymap 스키마. Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다.

-- 행정동 경계 (scripts/seed-admdong.mjs 로 채움)
create table if not exists admdong (
  code text primary key,          -- 10자리 행정동 코드
  name text not null,             -- 예: 을지로동
  full_name text not null,        -- 예: 서울특별시 중구 을지로동
  geom jsonb not null             -- GeoJSON geometry (EPSG:4326)
);
-- 좌표가 어느 동에 속하는지 빨리 찾기 위한 경계 사각형
alter table admdong add column if not exists min_lng double precision;
alter table admdong add column if not exists min_lat double precision;
alter table admdong add column if not exists max_lng double precision;
alter table admdong add column if not exists max_lat double precision;
create index if not exists admdong_name_idx on admdong (name);
create index if not exists admdong_bbox_idx on admdong (min_lng, max_lng, min_lat, max_lat);

-- 검색된 구역 (행정동 또는 도로 50m 버퍼)
create table if not exists areas (
  key text primary key,           -- dong:<code> / road:<도로명>:<시군구코드>
  kind text not null check (kind in ('dong', 'road')),
  label text not null,
  geom jsonb not null,
  collected_at timestamptz        -- 식당 수집 시각 (null 이면 아직 수집 전)
);

create table if not exists restaurants (
  id text primary key,            -- 카카오 장소 id 또는 osm:node/123
  name text not null,
  category text not null,         -- 예: 음식점 > 한식 > 국밥
  address text,
  road_address text,
  phone text,
  lat double precision not null,
  lng double precision not null,
  place_url text,
  updated_at timestamptz not null default now()
);

create table if not exists area_restaurants (
  area_key text not null references areas (key) on delete cascade,
  restaurant_id text not null references restaurants (id) on delete cascade,
  primary key (area_key, restaurant_id)
);

-- Gemini 가 판정한 "식당인가" 결과 캐시
create table if not exists category_verdicts (
  category text primary key,
  is_restaurant boolean not null,
  decided_at timestamptz not null default now()
);

-- 비플페이 가능 여부. 식당당 한 줄, 가장 최근 응답이 덮어씀
create table if not exists statuses (
  restaurant_id text primary key references restaurants (id) on delete cascade,
  status text not null check (status in ('available', 'unavailable')),
  updated_at timestamptz not null default now()
);

-- 쓰기는 서버(service role)만. 브라우저(anon)는 statuses 읽기만 허용
alter table admdong enable row level security;
alter table areas enable row level security;
alter table restaurants enable row level security;
alter table area_restaurants enable row level security;
alter table category_verdicts enable row level security;
alter table statuses enable row level security;

drop policy if exists "statuses are public" on statuses;
create policy "statuses are public" on statuses for select using (true);

-- 다른 사용자의 변경을 실시간으로 받기 위해
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'statuses'
  ) then
    alter publication supabase_realtime add table statuses;
  end if;
end $$;
