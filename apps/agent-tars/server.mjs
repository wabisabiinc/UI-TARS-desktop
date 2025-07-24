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
// CORS 許可
app.use(cors());
// JSON ボディのサイズ上限を 50MB に設定
app.use(express.json({ limit: '50mb' }));
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
    // 旧クライアント互換
    if (!Array.isArray(contents) && Array.isArray(req.body.messages)) {
      contents = req.body.messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content || '' }],
      }));
    }
    if (!Array.isArray(contents)) {
      return res.status(400).json({ error: '`contents` is required and must be an array.' });
    }

    const messages = contents.map(c => ({
      role: c.role,
      content: (c.content || c.parts?.[0]?.text) || '',
    }));

    const completion = await openai.chat.completions.create({
      model,
      messages,
    });
    res.json(completion);
  } catch (err) {
    console.error('generateMessage error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ── 画像解析エンドポイント（GPT-4o Vision） ───────────────────
app.post('/api/analyzeImage', async (req, res) => {
  try {
    // クライアントが送る Base64 部分文字列 or dataURL の両方に対応
    const { imageBase64, image } = req.body;
    let dataUrl;
    if (typeof image === 'string') {
      dataUrl = image;
    } else if (typeof imageBase64 === 'string') {
      dataUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
    }
    if (!dataUrl) {
      return res.status(400).json({ success: false, error: 'No image provided.' });
    }

    // ■ここがポイント■
    // GPT-4o Vision モデルでは、base64 をプロンプトに埋め込むのではなく
    // 「type: 'image_url'」として渡すとトークンカウントに含まれません。
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '以下の画像を日本語で説明してください。' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 1000  // 必要に応じて調整
    });

    const text = completion.choices?.[0]?.message?.content || '';
    return res.json({ success: true, content: text });
  } catch (err) {
    console.error('analyzeImage error:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
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
