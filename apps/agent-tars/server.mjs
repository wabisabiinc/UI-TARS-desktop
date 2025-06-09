// apps/agent-tars/server.mjs

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { Client as GeminiClient } from '@google/genai';

// 1) .env ファイルをロード（ローカル開発用）
//    Render ではダッシュボードの Environment Variables が使われます
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 2) JSON ボディをパース
app.use(express.json());

// 3) 環境変数チェック＆ログ
if (!process.env.OPENAI_API_KEY) {
  console.warn('[Warning] OPENAI_API_KEY is not set');
}
if (!process.env.GEMINI_API_KEY) {
  console.warn('[Warning] GEMINI_API_KEY is not set');
}

// 4) デフォルトモデルを環境変数から取得
const defaultOpenAIModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const defaultGeminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// 5) LLM クライアント初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GeminiClient({ apiKey: process.env.GEMINI_API_KEY });

// 6) /api/askLLMTool エンドポイント（プロキシ）
app.post('/api/askLLMTool', async (req, res) => {
  const { model: requestedModel, messages, tools } = req.body;

  // リクエストボディのバリデーション
  if (typeof messages !== 'object' || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages must be an array' });
  }

  // モデル選択: リクエスト指定、なければ環境変数 or デフォルト
  let model = typeof requestedModel === 'string'
    ? requestedModel
    : defaultOpenAIModel;

  try {
    // OpenAI GPT 系モデル
    if (model.startsWith('gpt')) {
      const response = await openai.chat.completions.create({
        model,
        messages,
        functions: tools,
        function_call: 'auto',
      });
      const msg = response.choices?.[0]?.message;
      return res.json({
        tool_calls: msg?.function_call
          ? [{ function: msg.function_call }]
          : [],
        content: msg?.content ?? '',
      });
    }

    // Google Gemini 系モデル
    if (model.startsWith('gemini')) {
      const prompt = messages.map((m) => m.content || '').join('\n');
      const response = await gemini.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
      });
      return res.json({
        tool_calls: [],
        content: response.text ?? '',
      });
    }

    // 未対応モデル
    return res.status(400).json({ error: `Unsupported model: ${model}` });
  } catch (error) {
    console.error('[LLM proxy error]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// 7) 静的ファイル配信
app.use(express.static(path.join(__dirname, 'dist/web')));

// 8) SPA フォールバック
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

// 9) サーバ起動
const port = parseInt(process.env.PORT, 10) || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
