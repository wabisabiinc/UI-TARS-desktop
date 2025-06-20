// apps/agent-tars/server.mjs
import 'dotenv/config';            // 環境変数 (.env) を自動読み込み
import express from 'express';
import cors from 'cors';          // CORS 対応
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';      // npm install openai

// ── __dirname/__filename の定義 ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());                  // フロントからの API 呼び出しを許可
app.use(express.json());

// ── OpenAI API キーの取得 ────────────────────────────────────────────────
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OpenAI API key is not set in environment variables.');
  // 必要に応じて process.exit(1) しても OK
}

const openai = new OpenAI({ apiKey: openaiApiKey });


// ── 1) メッセージ生成用エンドポイント ─────────────────────────────────
app.post('/api/generateMessage', async (req, res) => {
  try {
    const { model, contents } = req.body;
    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API key is not configured.' });
    }

    // フロントから送られてくる contents を chat-completions 向けの messages 形式に整形
    const messages = contents.map(c => ({
      role:    c.role,
      content: (c.content ?? c.parts?.[0]?.text) || '',
    }));

    // OpenAI へリクエスト
    const completion = await openai.chat.completions.create({
      model,
      messages,
    });

    return res.json(completion);
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});


// ── 2) 利用可能モデル一覧取得エンドポイント ─────────────────────────────
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();

    // フロントの Select が { key, title } の配列を期待するので整形
    const models = list.data.map(m => ({
      key:   m.id,
      title: m.id,
    }));

    return res.json({
      success: true,
      models,
    });
  } catch (err) {
    console.error('Error listing models:', err);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message,
    });
  }
});


// ── 3) 静的ファイル配信 & SPA フォールバック ───────────────────────────
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});


// ── サーバー起動 ────────────────────────────────────────────────────
const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
