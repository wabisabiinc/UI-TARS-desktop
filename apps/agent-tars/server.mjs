// apps/agent-tars/server.mjs
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// JSON ボディをパース
app.use(express.json());

// Gemini Proxy エンドポイント
app.post('/api/generateMessage', async (req, res) => {
  try {
    const { model, instances } = req.body;
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ instances }),
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Gemini proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 静的ファイルを配信
app.use(express.static(path.join(__dirname, 'dist/web')));

// SPA フォールバック
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
