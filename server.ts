import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { KNOWLEDGE_BASE_SECTIONS } from './src/data/knowledgeBase.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Compile full knowledge base text for system prompt
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

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    if (!apiKey) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY is not configured. Please set it in the AI Studio Secrets panel.' 
      });
    }

    // Convert messages to Gemini contents format
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Use gemini-3.8-flash
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1, // Low temperature for factual strictness
        maxOutputTokens: 1024,
      }
    });

    const reply = response.text || 'В документе нет ответа на этот вопрос.';
    res.json({ reply });
  } catch (err: any) {
    console.error('Gemini API error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Setup Vite middleware in dev or static files in production
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
