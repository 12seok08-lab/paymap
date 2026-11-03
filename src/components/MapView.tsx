"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Area, PayStatus, Restaurant } from "@/lib/types";

type Props = {
  area: Area | null;
  restaurants: Restaurant[];
  statuses: Record<string, PayStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const SEOUL: L.LatLngTuple = [37.5665, 126.978];

function pinIcon(status: PayStatus | undefined, selected: boolean) {
  const classes = ["pin", status ? `pin--${status}` : "", selected ? "pin--selected" : ""];
  return L.divIcon({
    className: "",
    html: `<div class="${classes.join(" ")}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapView({ area, restaurants, statuses, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const areaLayerRef = useRef<L.GeoJSON | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(SEOUL, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 구역 다각형을 그리고 화면을 구역에 맞춘다
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    areaLayerRef.current?.remove();
    areaLayerRef.current = null;
    if (!area) return;
    const layer = L.geoJSON(area.geom, {
      style: { color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.08 },
      interactive: false,
    }).addTo(map);
    areaLayerRef.current = layer;
    map.fitBounds(layer.getBounds(), { padding: [24, 24] });
  }, [area]);

  // 식당 마커는 목록이 바뀔 때만 다시 만든다
  useEffect(() => {
    const group = markerLayerRef.current;
    if (!group) return;
    group.clearLayers();
    markersRef.current.clear();
    for (const r of restaurants) {
      const marker = L.marker([r.lat, r.lng], { icon: pinIcon(undefined, false) })
        .bindTooltip(r.name, { direction: "top", offset: [0, -8] })
        .on("click", () => onSelectRef.current(r.id));
      marker.addTo(group);
      markersRef.current.set(r.id, marker);
    }
  }, [restaurants]);

  // 상태(가능/불가능)와 선택만 바뀌면 아이콘만 갈아 끼운다
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.setIcon(pinIcon(statuses[id], id === selectedId));
      marker.setZIndexOffset(statuses[id] === "available" ? 1000 : 0);
    }
  }, [restaurants, statuses, selectedId]);

  return <div ref={containerRef} className="map" />;
}
