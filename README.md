# paymap

도로명·동 이름·지명을 입력하면 그 구역의 식당을 지도에 표시하고, 사용자들이 비플페이 사용 가능 여부를 함께 표시하는 웹 서비스입니다.

- `을지로` → 도로 양옆 50m 구역 / `을지로동` → 행정동 경계 / `강남역` → 그 위치의 행정동
- `을지로 근처 한식집`처럼 문장으로 검색하면 Gemini가 지역과 음식 종류를 뽑아냅니다
- 식당을 눌러 **비플페이 가능**을 고르면 형광 테두리가 깜빡이고, **불가능**은 회색으로 표시됩니다
- 모든 사용자가 같은 지도를 보며, 같은 가게에 응답이 여러 번 오면 가장 최근 응답을 따릅니다 (실시간 반영)

## 구성

| 역할 | 사용 기술 | 키 |
|---|---|---|
| 지도 화면 | 오픈스트리트맵 + Leaflet | 필요 없음 |
| 도로 모양 | 오픈스트리트맵 Overpass API | 필요 없음 |
| 행정동 경계 | [vuski/admdongkor](https://github.com/vuski/admdongkor) (Supabase에 한 번 적재) | 필요 없음 |
| 식당 목록 · 지명 검색 | 카카오 로컬 API, 키가 없으면 오픈스트리트맵(Overpass, Nominatim) | 선택 (카카오 REST 키, 무료) |
| 자연어 해석 · 식당 아닌 업종 거르기 | Gemini API | API 키 |
| DB · 실시간 공유 | Supabase | 프로젝트 URL과 키 |
| 배포 | Vercel | |

## 처음 설정하기

1. **Supabase**: 프로젝트를 만든 뒤 SQL Editor에서 [supabase/schema.sql](supabase/schema.sql)을 실행합니다.
2. **키 준비**: `.env.example`을 `.env.local`로 복사하고 값을 채웁니다.
   - 카카오 (선택): [developers.kakao.com](https://developers.kakao.com) → 애플리케이션 추가 → REST API 키. 앱 설정에서 **카카오맵(로컬) 사용 설정**을 켜야 합니다. 비워 두면 오픈스트리트맵 식당 데이터를 쓰는데, 한국은 등록된 식당이 적습니다.
   - Gemini: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
3. **행정동 경계 적재** (한 번만, 약 35MB 다운로드):
   ```bash
   npm install
   npm run seed:admdong
   ```
4. **로컬 실행**: `npm run dev` 후 http://localhost:3000
5. **Vercel 배포**: GitHub 저장소를 Vercel에 연결하고, `.env.local`과 같은 환경변수를 Vercel 프로젝트 설정에 넣습니다.

## 알아둘 점

- 처음 검색하는 구역은 카카오에서 식당을 모으느라 수 초~수십 초 걸립니다. 이후 7일 동안은 저장된 목록을 씁니다.
- 공개 Overpass 서버는 요청 제한이 있어 도로 검색이 가끔 실패할 수 있습니다. 한 번 찾은 도로는 DB에 저장되어 다시 묻지 않습니다.
- 지금은 로그인 없이 누구나 가능/불가능을 누를 수 있습니다. 장난 입력이 문제가 되면 로그인이나 요청 제한을 추가하세요.
- 오픈스트리트맵 지도 타일은 [이용 정책](https://operations.osmfoundation.org/policies/tiles/)상 소규모 서비스용입니다. 사용자가 많아지면 별도 타일 서비스로 바꿔야 합니다.
