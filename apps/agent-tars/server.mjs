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

// ── Gemini 2.0-flash プロキシエンドポイント ──
app.post('/api/generateMessage', async (req, res) => {
  try {
    // 純粋な JavaScript としてデストラクト
    const { model, contents } = req.body;

    // 必須キーがあるかチェック
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not set.');
    }

    // Gemini v1 generateMessage エンドポイント
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateMessage`;

    // リクエストボディ組み立て
    const instances = Array.isArray(contents)
      ? contents.map((c) => ({
          author:
            c.role === 'system' || c.role === 'assistant' ? c.role : 'user',
          content:
            Array.isArray(c.parts) && c.parts.length
              ? c.parts[0].text
              : '',
        }))
      : [];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ instances }),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`[Gemini proxy] ${response.status}: ${txt}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Gemini proxy error:', error);
    res.status(500).json({ error: error.message || String(error) });
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
