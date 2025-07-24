// apps/agent-tars/server.mjs

import 'dotenv/config';            // .env の自動読み込み（OPENAI_API_KEY）
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
// CORS 有効化 （フロント側 /api 呼び出しを許可）
app.use(cors());
// JSON ボディのサイズ上限を 50MB に設定
app.use(express.json({ limit: '50mb' }));
// URLエンコードも同じく拡張
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── OpenAI クライアント初期化 ────────────────────────
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OpenAI API key is not set in environment variables.');
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// ── テスト用エンドポイント ─────────────────────────────
app.post('/api/testModelProvider', (_req, res) => {
  res.json({ success: true });
});

// ── メッセージ生成 ─────────────────────────────────────
app.post('/api/generateMessage', async (req, res) => {
  try {
    const { model } = req.body;
    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API key is not configured.' });
    }

    let contents = req.body.contents;
    // 古いクライアント互換
    if (!Array.isArray(contents) && Array.isArray(req.body.messages)) {
      contents = req.body.messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content || '' }],
      }));
    }
    if (!Array.isArray(contents)) {
      return res.status(400).json({ error: '`contents` is required and must be an array.' });
    }

    // ChatCompletion 用に整形
    const messages = contents.map(c => ({
      role: c.role,
      content: (c.content || c.parts?.[0]?.text) || '',
    }));

    const completion = await openai.chat.completions.create({ model, messages });
    res.json(completion);
  } catch (err) {
    console.error('generateMessage error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ── 画像解析エンドポイント ─────────────────────────────
app.post('/api/analyzeImage', async (req, res) => {
  try {
    // image または imageBase64 の両方に対応
    const payload = req.body;
    let dataUrl;

    if (typeof payload.image === 'string') {
      dataUrl = payload.image;
    } else if (typeof payload.imageBase64 === 'string') {
      dataUrl = payload.imageBase64.startsWith('data:')
        ? payload.imageBase64
        : `data:image/png;base64,${payload.imageBase64}`;
    }

    if (!dataUrl) {
      return res.status(400).json({ success: false, error: 'No image provided in request.' });
    }

    // Base64 部分のみ取り出して Buffer に
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');

    // GPT-4o Vision で解析（日本語で説明）
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `以下の画像を日本語で説明してください。\n${dataUrl}`,
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content || '';
    res.json({ success: true, content: text });
  } catch (err) {
    console.error('analyzeImage error:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// ── モデル一覧取得 ─────────────────────────────────────
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    const names = list.data.map(m => m.id);
    res.json({ success: true, models: names });
  } catch (err) {
    console.error('models list error:', err);
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── 静的ファイル & SPA フォールバック ───────────────────
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

// ── サーバー起動 ─────────────────────────────────────
const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
