import { fetchHtml, parseArticle, geminiChat, json } from "../_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url") || "";
  if (!target.startsWith("https://www.formula1.com/")) {
    return json({ error: "잘못된 URL" }, 400);
  }
  if (!env.GEMINI_API_KEY) {
    return json({ error: "API 키가 설정되지 않았습니다. Cloudflare 환경변수를 확인하세요." }, 400);
  }

  try {
    const html = await fetchHtml(target);
    const { kind, text } = parseArticle(html);

    if (kind === "none") {
      return json({
        summary:
          "본문을 가져올 수 없는 기사예요. 영상·팟캐스트이거나, 베팅 등 연령 확인이 " +
          "필요한 콘텐츠일 수 있습니다. 아래 '본문 바로가기'에서 원문을 확인해 주세요.",
        url: target,
      });
    }

    if (kind === "meta") {
      const prompt =
        "다음은 F1 기사 소개문이야. 이걸 바탕으로 한국어 2~3문장으로 자연스럽게 " +
        "정리해줘. 본문 전체가 아니라 소개문이라는 점을 감안해.\n\n" + text;
      const result = await geminiChat(env, prompt, { temperature: 0.3, maxTokens: 500 });
      return json({
        summary: "ℹ️ 본문 접근이 제한돼 소개문 기반으로 정리한 내용이에요.\n\n" + result,
        url: target,
      });
    }

    const prompt =
      "다음은 F1(포뮬러 원) 기사 본문이야. 한국어로 자세하게 요약해줘. " +
      "요약만 읽어도 구체적인 내용을 충분히 파악할 수 있도록, 핵심 사실과 함께 " +
      "중요한 수치·기록, 등장인물과 그들의 발언 요지, 배경과 맥락, 그리고 " +
      "전망이나 의미까지 포함해. 분량은 한국어 8~12문장 정도로, 2~3개 단락으로 " +
      "자연스럽게 구성해줘. 과장된 수식은 빼고 사실 위주로 쓰되 너무 압축하지는 마.\n\n" +
      text;
    const summary = await geminiChat(env, prompt, { temperature: 0.3, maxTokens: 1800 });
    return json({ summary, url: target });
  } catch (e) {
    return json({ error: "요약 실패: " + e.message }, 502);
  }
}
