// render-functions/askAI.js

import express from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json());

const { OPENAI_API_KEY, GEMINI_API_KEY, OPENAI_MODEL, GEMINI_MODEL } = process.env;

// APIキーがない場合はエラーを出すようにして、問題を分かりやすくします
if (!OPENAI_API_KEY || !GEMINI_API_KEY) {
  console.error('[Fatal Error] API keys are not set in the environment.');
  // 実際には関数は起動しますが、リクエストは失敗します
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const defaultOpenAIModel = OPENAI_MODEL || 'gpt-3.5-turbo';
const defaultGeminiModel = GEMINI_MODEL || 'gemini-2.0-flash';

// Renderはファイル名を元に /askAI というパスでこの関数を公開します
app.post('/askAI', async (req, res) => {
  const { model: requestedModel, messages, tools } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request: "messages" must be a non-empty array.' });
  }

  try {
    const model = requestedModel || defaultOpenAIModel;

    // OpenAIモデルの処理
    if (model.startsWith('gpt')) {
      // [修正] 非推奨の`functions`の代わりに`tools`を使用
      const response = await openai.chat.completions.create({
        model,
        messages,
        tools: tools,
        tool_choice: tools ? 'auto' : undefined,
      });
      return res.json(response.choices[0].message);
    }

    // Geminiモデルの処理
    if (model.startsWith('gemini')) {
      const geminiModel = genAI.getGenerativeModel({ model });
      // [改善] メッセージの役割(role)を維持したままGemini形式に変換
      const contents = messages.map(({ role, content }) => ({
        role: role === 'assistant' ? 'model' : role,
        parts: [{ text: content || '' }],
      }));

      const result = await geminiModel.generateContent({ contents });
      return res.json({ content: result.response.text() ?? '' });
    }

    return res.status(400).json({ error: `Unsupported model: ${model}` });

  } catch (error) {
    console.error(`[AI Function Error]`, error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({ error: error.message });
  }
});

// RenderがExpressアプリを正しく処理するために必要
export default app;