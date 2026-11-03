"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { AreaCandidate, PayStatus, SearchResponse } from "@/lib/types";

// Leaflet 은 브라우저에서만 동작한다
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Result = Extract<SearchResponse, { type: "result" }>;

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ list: AreaCandidate[]; cuisine: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PayStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 다른 사용자가 누른 가능/불가능을 실시간으로 반영
  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const channel = supabase
      .channel("statuses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "statuses" },
        (payload) => {
          const row = payload.new as { restaurant_id?: string; status?: PayStatus };
          if (row.restaurant_id && row.status) {
            setStatuses((prev) => ({ ...prev, [row.restaurant_id!]: row.status! }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function search(body: { q?: string; areaKey?: string; cuisine?: string }) {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SearchResponse;
      if (data.type === "error") {
        setError(data.message);
      } else if (data.type === "candidates") {
        setCandidates({ list: data.candidates, cuisine: data.cuisine });
      } else {
        setCandidates(null);
        setResult(data);
        setStatuses(data.statuses);
      }
    } catch {
      setError("서버에 연결하지 못했습니다");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) search({ q: query });
  }

  async function mark(id: string, status: PayStatus) {
    const before = statuses[id];
    setStatuses((prev) => ({ ...prev, [id]: status }));
    const res = await fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, status }),
    });
    if (!res.ok) {
      setStatuses((prev) => {
        const next = { ...prev };
        if (before) next[id] = before;
        else delete next[id];
        return next;
      });
      setError("저장하지 못했습니다. 다시 시도해 주세요");
    }
  }

  const restaurants = result?.restaurants ?? [];
  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId) ?? null,
    [restaurants, selectedId],
  );
  const availableCount = restaurants.filter((r) => statuses[r.id] === "available").length;

  return (
    <main className="app">
      <header className="top">
        <form onSubmit={onSubmit} className="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="을지로, 을지로동, 강남역, 을지로 근처 한식집"
            aria-label="검색어"
          />
          <button type="submit" disabled={loading}>
            {loading ? "찾는 중…" : "검색"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {result && !candidates && (
          <p className="summary">
            <strong>{result.area.label}</strong>
            {result.cuisine && ` · ${result.cuisine}`} · 식당 {restaurants.length}곳 · 비플페이 가능{" "}
            {availableCount}곳
          </p>
        )}
        {candidates && (
          <div className="candidates">
            <p>같은 이름의 구역이 여러 곳 있습니다. 하나를 고르세요.</p>
            <ul>
              {candidates.list.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => search({ areaKey: c.key, cuisine: candidates.cuisine })}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <MapView
        area={result?.area ?? null}
        restaurants={restaurants}
        statuses={statuses}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {selected && (
        <section className="panel" aria-label="식당 정보">
          <button type="button" className="close" onClick={() => setSelectedId(null)} aria-label="닫기">
            ×
          </button>
          <h2>{selected.name}</h2>
          <p className="category">{selected.category.split(" > ").slice(1).join(" · ")}</p>
          <p>{selected.road_address ?? selected.address}</p>
          {selected.phone && <p>{selected.phone}</p>}
          {selected.place_url && (
            <p>
              <a href={selected.place_url} target="_blank" rel="noreferrer">
                {selected.place_url.includes("openstreetmap") ? "오픈스트리트맵에서 보기" : "카카오맵에서 보기"}
              </a>
            </p>
          )}
          <p className="current">
            현재 표시:{" "}
            {statuses[selected.id] === "available"
              ? "비플페이 가능"
              : statuses[selected.id] === "unavailable"
                ? "비플페이 불가능"
                : "아직 응답 없음"}
          </p>
          <div className="actions">
            <button
              type="button"
              className={`yes ${statuses[selected.id] === "available" ? "on" : ""}`}
              onClick={() => mark(selected.id, "available")}
            >
              비플페이 가능
            </button>
            <button
              type="button"
              className={`no ${statuses[selected.id] === "unavailable" ? "on" : ""}`}
              onClick={() => mark(selected.id, "unavailable")}
            >
              비플페이 불가능
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
