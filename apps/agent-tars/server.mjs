// apps/agent-tars/server.mjs

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

import askAIRouter from '../rebder-functions/askAI.js';
app.use('/askAI',askAIRouter);

// 後方互換用: /api/askLLMTool を旧エンドポイントとして残す（必要な場合）
app.post('/api/askLLMTool', async (req, res, next) => {
  try {
    // 環境変数でオーバーライド可能に
    const fnUrl = process.env.AI_FUNCTION_URL
      || `${req.protocol}://${req.get('host')}/askAI`;

    const response = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    next(err);
  }
});

// 静的ファイル配信 + SPA フォールバック
const webDist = path.resolve(__dirname, 'dist', 'web');
app.use(express.static(webDist));
app.get('*', (req, res) => {
  res.sendFile(path.resolve(webDist, 'index.html'));
});

// 中央集約エラーハンドラ
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({ error: err.message });
});

// サーバ起動
const port = parseInt(process.env.PORT, 10) || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});

