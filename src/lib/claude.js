import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.SCRIPT_MODEL || "claude-haiku-4-5";

// Системный промт скриптера коротких вертикальных видео-объявлений.
const SCRIPTER_SYSTEM = `Ты — креативный сценарист коротких вертикальных видео (Reels/TikTok) для локального бизнеса.
Твоя задача — по названию бизнеса, офферу и стилю ведущего придумать ТРИ разных рекламных сценария длительностью 8–15 секунд каждый.

Требования к каждому сценарию:
- Цепляющий хук в первые 2 секунды (вопрос, провокация, выгода или интрига).
- Разговорный живой язык, короткие фразы, ритм под закадровый голос.
- Чёткий призыв к действию в конце.
- Без хэштегов, без эмодзи, без ремарок в скобках — только то, что произносит ведущий.
- Объём текста: 25–45 слов (чтобы уложиться в 8–15 секунд речи).
- Каждый из трёх вариантов — заметно разный по подаче (например: эмоциональный, фактический, юмористический).
- Адаптируй тон под выбранный стиль ведущего.

Верни СТРОГО валидный JSON-массив из ровно трёх объектов, без markdown, без пояснений, без обрамляющего текста.
Формат каждого объекта: {"title": "<короткий заголовок варианта, 2–4 слова>", "script": "<полный текст закадрового голоса>"}`;

const STYLE_LABELS = {
  young: "Молодой и энергичный ведущий: бодрый, на «ты», сленг уместен",
  expert: "Солидный эксперт: спокойный, уверенный, авторитетный тон",
  barber: "Креативный барбер: дерзкий, стильный, с характером",
};

export async function generateScripts({ businessName, offer, style }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const styleDesc = STYLE_LABELS[style] || STYLE_LABELS.young;

  const userPrompt = `Бизнес: ${businessName || "—"}
Что рекламируем / ключевые преимущества: ${offer || "—"}
Стиль ведущего: ${styleDesc}

Сгенерируй три сценария.`;

  // Без ключа — отдаём детерминированную заглушку, чтобы UI работал в деве.
  if (!apiKey) {
    return mockScripts(businessName, offer);
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SCRIPTER_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const parsed = safeParseArray(text);
  if (!parsed) {
    // не удалось распарсить — не роняем UX, отдаём заглушку
    return mockScripts(businessName, offer);
  }
  return parsed.slice(0, 3).map((s, i) => ({
    title: String(s.title || `Вариант ${i + 1}`),
    script: String(s.script || "").trim(),
  }));
}

function safeParseArray(text) {
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  try {
    const arr = JSON.parse(t);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function mockScripts(businessName, offer) {
  const b = businessName || "ваш бизнес";
  const o = offer || "выгодное предложение";
  return [
    {
      title: "Эмоциональный хук",
      script: `Устали от обычного? ${b} меняет правила. ${o} — то, что вы искали. Загляните сегодня и почувствуйте разницу. Ждём именно вас!`,
    },
    {
      title: "Факт и выгода",
      script: `${b}: ${o}. Без лишних слов — просто качество, которое видно сразу. Адрес в профиле. Приходите, пока есть места.`,
    },
    {
      title: "С юмором",
      script: `Серьёзно, вы ещё не были в ${b}? ${o} — и это не шутка. Друзья завидуют, соседи спрашивают адрес. Ваш ход!`,
    },
  ];
}
