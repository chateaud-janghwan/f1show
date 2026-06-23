# F1 한글 뉴스 보드 (Cloudflare Pages)

formula1.com 최신 뉴스를 카드로 보여주고, 카드를 누르면 본문을 한글로 요약해주는 웹앱입니다.
백엔드는 **Cloudflare Pages Functions(JavaScript)** 로 동작하며, 번역·요약은 **Google Gemini** 를 사용합니다.

## 구성
```
index.html              화면 (카드, 새로고침, 요약 모달, 더 보기)
functions/_shared.js    공용 로직 (크롤링/파싱/Gemini 호출)
functions/api/news.js   GET /api/news?page=N  → 뉴스 목록 + 한글 제목
functions/api/summary.js GET /api/summary?url= → 본문 한글 요약
```

## 배포 (GitHub + Cloudflare Pages)

1. **GitHub에 푸시** (아래 "로컬에서 푸시" 참고). `.env`·`.dev.vars` 는 절대 커밋하지 마세요(.gitignore 처리됨).

2. **Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git** 에서 이 저장소를 선택.

3. **빌드 설정**
   - Framework preset: `None`
   - Build command: (비움)
   - Build output directory: `/`  (루트)

4. **환경변수(Secret) 등록** — Pages 프로젝트 → Settings → Variables and Secrets:
   - `GEMINI_API_KEY` = 본인 Gemini 키  *(Secret 으로 추가)*
   - (선택) `GEMINI_MODEL` = `gemini-2.0-flash`

5. **Save and Deploy**. 잠시 후 `https://<프로젝트>.pages.dev` 로 발행됩니다.

> 환경변수를 나중에 추가/수정하면 **재배포(Retry deployment)** 해야 반영됩니다.

## 로컬에서 미리보기 (선택)
```bash
npm install -g wrangler
cp .dev.vars.example .dev.vars   # 그리고 .dev.vars 에 키 입력
wrangler pages dev .
```

## 로컬에서 GitHub로 푸시
```bash
git init
git add .
git commit -m "F1 한글 뉴스 보드 (Cloudflare Pages)"
git branch -M main
git remote add origin https://github.com/<본인계정>/<리포이름>.git
git push -u origin main
```

## ⚠️ 꼭 알아둘 점
- **API 키를 코드/깃에 넣지 마세요.** 키는 Cloudflare 환경변수에만 둡니다.
- **공개 사이트는 누구나 사용 → 본인 Gemini 키 사용량이 소모됩니다.** 무료 한도라 금방 막히거나, 유료 전환 시 비용이 발생할 수 있어요. 공개 범위를 제한하거나(예: Cloudflare Access), 사용량을 모니터링하세요.
- Gemini 무료 티어는 분당/일일 요청 제한이 있어, 짧은 시간에 호출이 몰리면 일시적으로 `429` 가 날 수 있습니다(코드에 자동 재시도 포함).
- 베팅 등 연령 제한 콘텐츠·영상/팟캐스트 기사는 본문을 가져올 수 없어, 소개문 기반 요약 또는 안내 메시지로 대체됩니다.
