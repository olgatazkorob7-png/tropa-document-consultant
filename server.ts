import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import { KNOWLEDGE_BASE_SECTIONS } from './src/data/knowledgeBase.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());

// These are the user's existing model IDs, not verified availability claims.
const MODELS_TO_TRY = [
  { model: 'gemini-3.1-flash-lite', timeoutMs: 30000 },
];

const fullKnowledgeBaseText = KNOWLEDGE_BASE_SECTIONS.map(
  (sec) => `=== РАЗДЕЛ: ${sec.title} (ID: ${sec.id}) ===\n${sec.content}`
).join('\n\n');

const SYSTEM_INSTRUCTION = `Ты — консультант интернет-магазина «Тропа». Ты отвечаешь на вопросы пользователя строго по загруженному документу «База знаний Тропа».

ГЛАВНОЕ ПРАВИЛО:
Отвечай только той информацией, которая прямо есть в документе. Не добавляй ничего от себя — ни общих знаний, ни предположений, ни догадок. Если ответа в документе нет — скажи ровно: «В документе нет ответа на этот вопрос». Не пытайся угадать.

КАК ОТВЕЧАТЬ:
1. Сначала найди в документе точный фрагмент, который отвечает на вопрос.
2. Отвечай кратко и по делу, на русском языке. Без вступлений и лишних пояснений.
3. Если вопрос про товар — укажи SKU и ключевые характеристики из карточки (вес, размеры, материалы, температуры и т.п.).
4. Если вопрос про правила (доставка, возврат, гарантия, оплата, бонусы) — назови раздел документа, откуда взял ответ.
5. Если в документе есть несколько подходящих пунктов — перечисли их все, не выбирай один наугад.
6. Если данные в документе противоречат друг другу — приведи оба варианта и укажи, в каких разделах они находятся.

ЧЕГО НЕ ДЕЛАТЬ:
- Не выдумывай цифры, сроки, цены, характеристики, которых нет в документе.
- Не давай юридических, медицинских или финансовых советов от себя.
- Не ссылайся на внешние источники и не используй знания вне документа.
- Не упоминай, что ты ИИ, языковая модель или бот. Говори от лица поддержки «Тропа».

ОГРАНИЧЕНИЕ ДЛИНЫ:
Отвечай не более чем 3–5 предложениями. Не повторяй вопрос. Не добавляй вступлений типа «Конечно» или «Отличный вопрос». Сразу переходи к сути.

ФОРМАТ ОТВЕТА:
Короткий ответ по существу. В конце — строка вида:
«Источник: [название раздела документа]»
Если ответа нет — вместо этого напиши: «В документе нет ответа на этот вопрос».

НИЖЕ ПРИВЕДЕН ПОЛНЫЙ ТЕКСТ ДОКУМЕНТА «БАЗА ЗНАНИЙ ТРОПА»:
--------------------------------------------------
${fullKnowledgeBaseText}
--------------------------------------------------`;

class ModelTimeoutError extends Error {
  readonly status = 504;
}

function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const item = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    error?: { code?: unknown; status?: unknown };
  };
  let nested: typeof item = {};
  if (typeof item.message === 'string') {
    try {
      const parsed: unknown = JSON.parse(item.message);
      if (parsed && typeof parsed === 'object') nested = parsed as typeof item;
    } catch {
      // A provider message need not contain JSON.
    }
  }
  for (const value of [item.status, item.code, item.error?.code,
    nested.status, nested.code, nested.error?.code]) {
    const number = typeof value === 'number' ? value
      : typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : NaN;
    if (Number.isInteger(number) && number >= 400 && number <= 599) return number;
  }
  const named = [item.status, item.error?.status, nested.status, nested.error?.status];
  if (named.includes('UNAVAILABLE')) return 503;
  if (named.includes('RESOURCE_EXHAUSTED')) return 429;
  if (named.includes('DEADLINE_EXCEEDED')) return 504;
  return undefined;
}

function publicError(error: unknown) {
  const status = httpStatus(error);
  if (status === 503) return {
    status: 503, code: 'MODEL_UNAVAILABLE',
    error: 'Сервис ответов временно недоступен. Попробуйте позже. Пока информацию можно найти в базе знаний слева.',
  };
  if (status === 504) return {
    status: 504, code: 'MODEL_TIMEOUT',
    error: 'Сервис не успел ответить. Автоматически повторять запрос не будем. Пока информацию можно найти в базе знаний слева.',
  };
  if (status === 429) return {
    status: 429, code: 'MODEL_RATE_LIMIT',
    error: 'Достигнут лимит запросов к сервису ответов. Попробуйте позже.',
  };
  if (status === 400 || status === 401 || status === 403 || status === 404) return {
    status: 502, code: 'MODEL_CONFIGURATION_ERROR',
    error: 'Не удалось обратиться к выбранной модели. Администратору нужно проверить модель, доступ и настройки проекта.',
  };
  return {
    status: 502, code: 'MODEL_REQUEST_FAILED',
    error: 'Не удалось получить ответ от сервиса модели. Пока информацию можно найти в базе знаний слева.',
  };
}

function chatContents(messages: unknown): Content[] | undefined {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return;
  let characters = 0;
  for (const message of messages) {
    if (!message || typeof message !== 'object'
      || (message.role !== 'user' && message.role !== 'assistant')
      || typeof message.content !== 'string' || !message.content.trim()) return;
    characters += message.content.length;
  }
  if (characters > 20000 || messages.at(-1).role !== 'user') return;
  const firstUser = messages.findIndex((message) => message.role === 'user');
  if (firstUser < 0) return;
  return messages.slice(firstUser).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

async function callModelWithTimeout(
  ai: GoogleGenAI, model: string, contents: Content[], timeoutMs: number,
) {
  // SDK abort is client-side only; it cannot guarantee service-side cancellation
  // or prevent billing. Do not start a fallback after an uncertain timeout.
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ModelTimeoutError('Client deadline exceeded'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      ai.models.generateContent({
        model, contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          abortSignal: controller.signal,
          ...(model === 'gemini-4-hydrogen'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      }),
      deadline,
    ]);
  } catch (error: unknown) {
    if (timedOut) throw new ModelTimeoutError('Client deadline exceeded');
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

app.post('/api/chat', async (req, res) => {
  const contents = chatContents(req.body?.messages);
  if (!contents) {
    return res.status(400).json({
      error: 'Нужен непустой вопрос и корректная история диалога: не более 40 сообщений и 20 000 символов.',
      code: 'INVALID_MESSAGES',
    });
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Gemini configuration:', { code: 'MISSING_API_KEY' });
    return res.status(503).json({
      error: 'Сервис ответов пока не настроен. Сообщите администратору.',
      code: 'MODEL_NOT_CONFIGURED',
    });
  }
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    for (let index = 0; index < MODELS_TO_TRY.length; index += 1) {
      const { model, timeoutMs } = MODELS_TO_TRY[index];
      let response;
      try {
        response = await callModelWithTimeout(ai, model, contents, timeoutMs);
      } catch (error: unknown) {
        const status = httpStatus(error);
        console.warn('Gemini attempt failed:', {
  model,
  status: status ?? 'unknown',
  reason: error instanceof ModelTimeoutError
    ? 'CLIENT_TIMEOUT'
    : 'PROVIDER_ERROR',
});
        // Never log raw provider errors: they may contain request data or secre
        // Only an explicit 503 permits the existing fallback. No retry after
        // timeout, network failure, quota error, invalid key or invalid model.
        if (status === 503 && index + 1 < MODELS_TO_TRY.length) continue;
        throw error;
      }
      const reply = response.text?.trim();
      if (!reply) {
        return res.status(502).json({
          error: 'Сервис вернул пустой ответ. Это не означает, что ответа нет в документе.',
          code: 'EMPTY_MODEL_RESPONSE',
        });
      }
      return res.json({ reply });
    }
    throw new Error('No model response');
  } catch (error: unknown) {
    const result = publicError(error);
    console.error('Gemini request failed:', { code: result.code, status: result.status });
    return res.status(result.status).json({ error: result.error, code: result.code });
  }
});

if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
