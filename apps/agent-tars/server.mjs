// apps/agent-tars/server.mjs
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';           // npm install openai

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());

// → 環境変数から API キーを取得
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OpenAI API key is not set in environment variables.');
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// ── OpenAI Chat Completions 用エンドポイント ──
app.post('/api/generateMessage', async (req, res) => {
  try {
    const { model, contents } = req.body;

    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API key is not configured.' });
    }

    // フロントから送られてくる contents を chat-completions 用の messages 形式に整形
    const messages = contents.map((c) => ({
      role:    c.role,                                 // 'user' または 'assistant'
      content: c.content ?? c.parts?.[0]?.text ?? '',  // contents の形に合わせて適宜
    }));

    // OpenAI にリクエスト
    const completion = await openai.chat.completions.create({
      model,      // 例: 'gpt-4o-mini' や 'gpt-4o'
      messages,
    });

    return res.json(completion);
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return res.status(500).json({ error: err.message || err.toString() });
  }
});


// API & connect設定
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    // 接続OKならモデル数を返す
    res.json({ ok: true, count: list.data.length });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// 静的ファイル配信 & SPA フォールバック
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
