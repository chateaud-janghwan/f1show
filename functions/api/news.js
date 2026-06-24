import { fetchHtml, parseListing, geminiChat, json } from "../_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let page = parseInt(url.searchParams.get("page") || "1", 10);
  if (!(page >= 1)) page = 1;

  try {
    const target =
      "https://www.formula1.com/en/latest" + (page > 1 ? `?page=${page}` : "");
    const html = await fetchHtml(target);
    const items = parseListing(html, 18);

    if ((env.GROQ_API_KEY || env.GEMINI_API_KEY) && items.length) {
      try {
        const numbered = items.map((it, i) => `${i + 1}. ${it.title}`).join("\n");
        const prompt =
          "다음 F1 뉴스 영어 제목들을 자연스러운 한국어 제목으로 번역해줘. " +
          "사람 이름·팀명 등 고유명사는 한국 F1 팬들이 흔히 쓰는 표기를 사용하고, " +
          "번역된 제목만 같은 번호 순서로 JSON 배열(문자열 배열)로만 출력해. " +
          "설명 없이 JSON 배열만.\n\n" +
          numbered;
        const out = await geminiChat(env, prompt, { temperature: 0.2, maxTokens: 1500 });
        const mm = out.match(/\[[\s\S]*\]/);
        const arr = mm ? JSON.parse(mm[0]) : [];
        items.forEach((it, i) => {
          it.title_en = it.title;
          const ko = arr[i] ? String(arr[i]).trim() : "";
          it.title_ko = ko || it.title;
        });
      } catch (e) {
        items.forEach((it) => {
          it.title_en = it.title;
          it.title_ko = it.title; // 번역 실패 시 원문 유지
        });
      }
    } else {
      items.forEach((it) => {
        it.title_en = it.title;
        it.title_ko = it.title;
      });
    }

    return json({ items, page, has_key: !!(env.GROQ_API_KEY || env.GEMINI_API_KEY) });
  } catch (e) {
    return json({ error: "크롤링 실패: " + e.message }, 502);
  }
}
