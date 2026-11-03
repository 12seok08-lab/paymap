import type { Geometry } from "geojson";

export type PayStatus = "available" | "unavailable";

export type Area = {
  key: string;
  kind: "dong" | "road";
  label: string;
  geom: Geometry;
};

export type Restaurant = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  road_address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  place_url: string | null;
};

export type AreaCandidate = { key: string; label: string };

export type SearchResponse =
  | { type: "candidates"; candidates: AreaCandidate[]; cuisine: string }
  | {
      type: "result";
      area: Area;
      cuisine: string;
      restaurants: Restaurant[];
      statuses: Record<string, PayStatus>;
    }
  | { type: "error"; message: string };
