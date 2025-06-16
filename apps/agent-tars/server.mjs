// apps/agent-tars/server.mjs
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';  // npm install node-fetch@2

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// JSON ボディをパース
app.use(express.json());

// ── Gemini 2.0-Flash プロキシエンドポイント ──
app.post('/api/generateMessage', async (req, res) => {
  try {
    // クライアントから { model, contents } を受け取る
    const { model, contents } = req.body;
    // サーバ側キー（Render の env か .env でセット）
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is not set.' });
    }

    // ★ ここを v1beta2 に変更 ★
    const url = `https://generativelanguage.googleapis.com/v1beta2/models/${model}:generateMessage`;

    // Google の期待フォーマットに合わせて build
    const body = {
      instances: [
        {
          messages: contents.map((c) => ({
            author: c.role,           // 'user' か 'assistant'
            content: c.parts[0]?.text || '',
          })),
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('[Gemini proxy] error response:', txt);
      return res.status(response.status).json({ error: txt });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: err.message || err.toString() });
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
