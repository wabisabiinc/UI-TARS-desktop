// apps/agent-tars/server.mjs
import 'dotenv/config';            // ① .env の自動読み込み
import express from 'express';
import cors from 'cors';          // ② CORS ミドルウェア
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';      // npm install openai

// __dirname/__filename の定義
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());                  // ② フロントからの API 呼び出しを許可
app.use(express.json());

// → 環境変数から API キーを取得
const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OpenAI API key is not set in environment variables.');
  // キーがない場合は起動を止めても良いですが、ここではログのみ出力して続行
}

const openai = new OpenAI({ apiKey: openaiApiKey });

// ── 1) メッセージ生成用エンドポイント ──
app.post('/api/generateMessage', async (req, res) => {
  try {
    const { model, contents } = req.body;
    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API key is not configured.' });
    }

    // フロントから送られてくる contents を chat-completions 用の messages 形式に変換
    const messages = contents.map(c => ({
      role:    c.role,                                 // 'user' または 'assistant'
      content: c.content ?? c.parts?.[0]?.text || '',  // incoming schema に合わせて
    }));

    // OpenAI にリクエスト
    const completion = await openai.chat.completions.create({
      model,   // UI から渡された文字列をそのまま利用
      messages,
    });

    return res.json(completion);
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// ── 2) 利用可能モデル一覧取得エンドポイント ──
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    // UI 側でプルダウン等を作るため、モデル名の配列だけ返しても良い
    const names = list.data.map(m => m.id);
    res.json({ success: true, models: names });
  } catch (err) {
    console.error('Error listing models:', err);
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── 3) 静的ファイルと SPA フォールバック ──
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

// サーバー起動
const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
