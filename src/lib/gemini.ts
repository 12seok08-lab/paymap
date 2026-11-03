// Gemini: 자연어 검색 해석, 식당 아닌 업종 거르기, 음식 종류 매칭
import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | undefined;

function client(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 가 없습니다");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

async function askJson<T>(prompt: string, schema: object): Promise<T> {
  const res = await client().models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", responseJsonSchema: schema },
  });
  if (!res.text) throw new Error("Gemini 응답이 비어 있습니다");
  return JSON.parse(res.text) as T;
}

export type ParsedQuery = { place: string; cuisine: string };

export async function parseQuery(query: string): Promise<ParsedQuery> {
  return askJson<ParsedQuery>(
    `사용자가 한국 지도 서비스에 입력한 검색어입니다: "${query}"
place: 검색할 지역 이름 하나 (도로명 "을지로", 동 이름 "을지로동", 지명 "강남역" 등). 원문 표기를 그대로 쓰고 "근처", "주변" 같은 말은 뺍니다.
cuisine: 찾는 음식 종류 (예: "한식", "국밥", "일식"). 없으면 빈 문자열.`,
    {
      type: "object",
      properties: { place: { type: "string" }, cuisine: { type: "string" } },
      required: ["place", "cuisine"],
    },
  );
}

// 카카오 업종명(예: "음식점 > 간식 > 제과,베이커리")마다 끼니를 먹는 식당인지 판정
export async function classifyCategories(categories: string[]): Promise<Record<string, boolean>> {
  const result = await askJson<{ category: string; isRestaurant: boolean }[]>(
    `아래는 카카오맵 업종 분류입니다. 각 업종이 끼니 식사를 하는 "식당"인지 판정하세요.
카페, 디저트, 제과/베이커리, 간식, 아이스크림, 술만 파는 바/호프, 편의점, 식료품점은 식당이 아닙니다.
분식, 패스트푸드, 고기집처럼 식사가 되는 곳은 식당입니다.

${categories.map((c) => `- ${c}`).join("\n")}`,
    {
      type: "array",
      items: {
        type: "object",
        properties: { category: { type: "string" }, isRestaurant: { type: "boolean" } },
        required: ["category", "isRestaurant"],
      },
    },
  );
  return Object.fromEntries(result.map((r) => [r.category, r.isRestaurant]));
}

// "한식집", "국밥" 같은 요청에 맞는 업종만 고른다
export async function matchCuisine(cuisine: string, categories: string[]): Promise<string[]> {
  const result = await askJson<{ matches: string[] }>(
    `사용자가 찾는 음식: "${cuisine}"
아래 카카오맵 업종 중 이 요청에 맞는 것을 모두 고르세요. 목록의 문자열을 그대로 반환합니다.

${categories.map((c) => `- ${c}`).join("\n")}`,
    {
      type: "object",
      properties: { matches: { type: "array", items: { type: "string" } } },
      required: ["matches"],
    },
  );
  return result.matches;
}
