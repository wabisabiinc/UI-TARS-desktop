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
app.use(cors());
app.use(express.json());

// API キー取得
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OpenAI API key is not set in environment variables.');
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// ── テスト用エンドポイント ─────────────────────────────
app.post('/api/testModelProvider', (_req, res) => {
  return res.json({ success: true });
});

// ── メッセージ生成 ─────────────────────────────────────
app.post('/api/generateMessage', async (req, res) => {
  try {
    const { model } = req.body;

    // 1) 必ずキーは存在するか？
    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API key is not configured.' });
    }

    // 2) まずは req.body.contents を取ってみる
    let { contents } = req.body;

    // 3) フォールバック: 古いクライアントが req.body.messages を投げているなら、こちらを変換
    if (!Array.isArray(contents) && Array.isArray(req.body.messages)) {
      contents = req.body.messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content ?? '' }],
      }));
    }

    // 4) 最終的に contents が配列でなければエラー
    if (!Array.isArray(contents)) {
      return res
        .status(400)
        .json({ error: '`contents` is required and must be an array.' });
    }

    // 5) OpenAI 用に整形
    const messages = contents.map((c) => ({
      role:    c.role,
      content: (c.content ?? c.parts?.[0]?.text) || '',
    }));

    // 6) 実際に OpenAI に投げる
    const completion = await openai.chat.completions.create({ model, messages });
    return res.json(completion);

  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// ── モデル一覧取得 ─────────────────────────────────────
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    const names = list.data.map(m => m.id);
    return res.json({ success: true, models: names });
  } catch (err) {
    console.error('Error listing models:', err);
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message });
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
