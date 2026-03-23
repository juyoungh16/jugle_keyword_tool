# Jugle — 키워드 발굴 도구

> 네이버 · 구글 통합 키워드 발굴 & 콘텐츠 전략 도구 (개인용, IT/테크 특화)

## 프로젝트 구조

```
jugle/
├── index.html   # 마크업 (186줄)
├── style.css    # 스타일 (226줄)
├── main.js      # 비즈니스 로직 (974줄)
└── README.md
```

## 현재 기술 스택

- **Single HTML** → index.html + style.css + main.js 분리 완료
- **AI**: Claude Sonnet (Anthropic API, direct browser access)
- **그래프**: D3.js v7 (CDN)
- **차트**: Chart.js v4 (동적 로드, 키워드 비교 시)
- **저장**: localStorage (`jugle_keywords`, `jugle_api_key`, `jugle_sessions`)

## 기능 목록

| 메뉴 | 기능 | 데이터 소스 |
|---|---|---|
| 트렌드 탐색 | 분야별 급상승 키워드 + 24h 스파크라인 + 연관 태그 | ⚠️ AI 추론 |
| 키워드 확장 | 씨앗 키워드 → 30~40개 롱테일 + 인지/고려/전환 분류 | ⚠️ AI 추론 |
| 콘텐츠 전략 | 토픽 클러스터 맵 + 인텐트 갭 분석 + 캘린더 | ⚠️ AI 추론 |
| 저장함 | 키워드 저장 · 필터 · JSON 백업/복원 | localStorage |
| 키워드 비교 | 선택 키워드 우선순위 분석 + 시계열 차트 | AI 추론 |

## 로드맵

### Phase 2 — 네이버 검색광고 API 연동 (다음)
- 필요: API Key, Secret Key, CustomerID
- 연동 시 교체: Volume (AI추론 → 실제 검색량), KD (AI추론 → compIdx)
- CORS 이슈: 브라우저 직접 호출 불가 → Netlify Functions 프록시 필요

### Phase 3 — 네이버 데이터랩 API
- 트렌드 탐색 시계열 데이터 실제화
- 네이버 개발자센터 앱 등록 필요

### Phase 4 — 구글 트렌드 (pytrends)
- Python 프록시 서버 필요 (Render.com 무료 배포)
- 구글 탭 시계열 데이터 실제화

### Phase 5 — 배포
- Netlify Drop (index.html 단일 배포 가능)
- API 프록시는 Netlify Functions or Render.com

## API 연동 포인트 (main.js)

```javascript
// 현재 모든 데이터는 callClaude()를 통해 AI 추론으로 생성됨
// Phase 2에서 아래 함수들을 교체 예정:

// 트렌드 탐색: exploreTrend() → 네이버 데이터랩 API
// 키워드 확장: expandLongtail() → 네이버 검색광고 /keywordstool
// Volume 수치: 전체 AI추론 → 실제 절댓값으로 교체
```

## 인텐트 정의

| 의도 | 색상 | 키워드 패턴 | 콘텐츠 방향 |
|---|---|---|---|
| 인지 | 하늘색 `#0284C7` | ~이란, ~뜻, ~원리 | 가이드, 개념 설명 |
| 고려 | 노란색 `#CA8A04` | ~추천, ~비교, ~후기 | 비교글, 리뷰 |
| 전환 | 초록색 `#16A34A` | ~가격, ~신청, ~다운로드 | 랜딩, CTA |

## localStorage 스키마

```json
// jugle_keywords
[{
  "keyword": "AI 코딩 도구",
  "intent": "고려",
  "source": "트렌드탐색",
  "savedAt": "2025-03-20T00:00:00.000Z"
}]
```
