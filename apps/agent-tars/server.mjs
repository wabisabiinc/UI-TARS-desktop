// apps/agent-tars/server.mjs

import 'dotenv/config';            // .env の自動読み込み
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
// CORS と大きめの JSON ボディを許可
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// OpenAI クライアント初期化
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OPENAI_API_KEY が未設定です。');
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// ── テスト用エンドポイント ─────────────────────────────
app.post('/api/testModelProvider', (_req, res) => {
  res.json({ success: true });
});

// ── メッセージ生成エンドポイント ─────────────────────────
app.post('/api/generateMessage', async (req, res) => {
  try {
    const {
      model,
      messages,
      functions,
      temperature = 0.3,
      max_tokens = 1500,
    } = req.body;

    if (!openaiApiKey) {
      return res
        .status(400)
        .json({ error: 'OpenAI API key is not configured.' });
    }

    // 高精度プロンプトを先頭に追加
    const systemPrompt = {
      role: 'system',
      content:
        'You are a domain‑expert AI assistant. Provide concise, authoritative, ' +
        'and richly detailed answers. Cite examples or data where possible.',
    };

    const chatMessages = Array.isArray(messages)
      ? [systemPrompt, ...messages]
      : [systemPrompt];

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      functions,
      function_call: 'auto',
      temperature,
      max_tokens,
    });

    res.json(completion);
  } catch (err) {
    console.error('generateMessage error:', err);
    res
      .status(500)
      .json({ error: err.message || String(err) });
  }
});

// ── 画像解析エンドポイント（GPT‑4o Vision） ──────────────────
app.post('/api/analyzeImage', async (req, res) => {
  try {
    // クライアントからは { image: 'data:image/...;base64,...' } を受け取る
    const { image } = req.body;
    if (typeof image !== 'string' || !image.startsWith('data:')) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid image format.' });
    }

    // 画像解析用 system プロンプト
    const systemPrompt = {
      role: 'system',
      content:
        'You are a world‑class visual reasoning AI. Describe what you see in 3–5 ' +
        'structured paragraphs, focusing on objects, relationships, and context.',
    };

    // attachments 形式で渡し、Base64 をトークン計算から除外
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        systemPrompt,
        {
          role: 'user',
          content: '以下の画像を説明してください。',
          attachments: [
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const text = completion.choices?.[0]?.message?.content || '';
    res.json({ success: true, content: text });
  } catch (err) {
    console.error('analyzeImage error:', err);
    res
      .status(500)
      .json({ success: false, error: err.message || String(err) });
  }
});

// ── モデル一覧取得エンドポイント ───────────────────────────
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    const names = list.data.map((m) => m.id);
    res.json({ success: true, models: names });
  } catch (err) {
    console.error('models list error:', err);
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── 静的ファイル & SPA フォールバック ───────────────────────
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

// ── サーバー起動 ─────────────────────────────────────────
const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
