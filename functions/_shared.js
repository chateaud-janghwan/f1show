// 공용 헬퍼 — Cloudflare Pages Functions (JavaScript / Workers 런타임)
// 파이썬 app.py의 크롤링/파싱/LLM 호출 로직을 JS로 포팅한 것.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&#x27;": "'", "&apos;": "'", "&nbsp;": " ",
  "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”",
  "&ldquo;": "“", "&ndash;": "–", "&mdash;": "—",
  "&hellip;": "…",
};

export function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;/g, (m) => ENTITIES[m] || m);
}

export function stripTags(s) {
  return (s || "").replace(/<[^>]+>/g, " ");
}

export async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.text();
}

// 최신 뉴스 목록 파싱 -> [{url, title, image}]
export function parseListing(html, limit = 18) {
  const re =
    /<a\b[^>]*href="((?:https:\/\/www\.formula1\.com)?\/en\/latest\/article\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const map = new Map();
  const order = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].split("?")[0].split("#")[0];
    if (href.startsWith("/")) href = "https://www.formula1.com" + href;
    const inner = m[2];
    if (!map.has(href)) {
      map.set(href, { url: href, title: "", image: null });
      order.push(href);
    }
    const d = map.get(href);
    const text = decodeEntities(stripTags(inner)).replace(/\s+/g, " ").trim();
    if (text.length > d.title.length) d.title = text;
    if (!d.image) {
      // 카드 이미지는 기사 링크 바깥(앞쪽 별도 span)에 있음 → 링크 앞 구간에서
      // 가장 가까운 media 이미지를 잡는다 (w_64 드라이버 내비 썸네일 제외).
      const start = Math.max(0, m.index - 1500);
      const win = html.slice(start, m.index + m[0].length);
      const imgRe = /<img\b[^>]*?\bsrc="(https:\/\/media\.formula1\.com\/[^"]+)"/gi;
      let last = null, mm;
      while ((mm = imgRe.exec(win)) !== null) {
        if (!mm[1].includes("w_64")) last = mm[1];
      }
      if (last) d.image = last;
    }
  }
  return order.map((u) => map.get(u)).filter((x) => x.title).slice(0, limit);
}

// 기사 본문 파싱 -> {kind:'full'|'meta'|'none', text}
export function parseArticle(html, maxChars = 6000) {
  let meta = "";
  const md =
    html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ||
    html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i) ||
    html.match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i);
  if (md) meta = decodeEntities(md[1]).trim();

  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const paras = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = decodeEntities(stripTags(m[1])).replace(/\s+/g, " ").trim();
    if (t.length > 40) paras.push(t);
  }
  const text = paras.join("\n");
  if (text.length >= 120) return { kind: "full", text: text.slice(0, maxChars) };
  if (meta) return { kind: "meta", text: meta };
  return { kind: "none", text: "" };
}

// Gemini 호출 (429는 잠시 대기 후 자동 재시도)
export async function geminiChat(env, prompt, opts = {}) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("NO_API_KEY");
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 700;

  const gen = { temperature, maxOutputTokens: maxTokens };
  if (model.includes("2.5")) gen.thinkingConfig = { thinkingBudget: 0 };
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: gen,
  });

  const waits = [3000, 12000];
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body }
    );
    if (r.status === 200) {
      const d = await r.json();
      const parts = d?.candidates?.[0]?.content?.parts || [];
      return parts.map((p) => p.text || "").join("").trim();
    }
    if (r.status === 429 && attempt < waits.length) {
      await new Promise((s) => setTimeout(s, waits[attempt]));
      continue;
    }
    const t = await r.text();
    throw new Error(`Gemini API 오류 ${r.status}: ${t.slice(0, 200)}`);
  }
}
