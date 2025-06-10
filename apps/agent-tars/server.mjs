// apps/agent-tars/server.mjs

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
// [削除] dotenv, OpenAI, Geminiのimportは不要になります

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// [修正] /api/askLLMToolエンドポイントを、サーバーレス関数への中継役に変更
app.post('/api/askLLMTool', async (req, res) => {
  try {
    // Renderの内部ネットワークを通じてサーバーレス関数を呼び出します
    // Renderが自動的にルーティングしてくれるため、パスを指定するだけでOK
    const functionUrl = `${req.protocol}://${req.get('host')}/askAI`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    // サーバーレス関数からの応答を、そのままクライアントに返す
    const data = await response.json();
    res.status(response.status).json(data);

  } catch (error) {
    console.error('[Proxy Error]', error);
    res.status(500).json({ error: 'Failed to proxy request to AI function.' });
  }
});

// 静的ファイル配信とSPAフォールバック (ここは変更なし)
const webDistPath = path.resolve(__dirname, 'dist/web');
app.use(express.static(webDistPath));
app.get('*', (req, res) => {
  res.sendFile(path.resolve(webDistPath, 'index.html'));
});

// サーバー起動 (ここは変更なし)
const port = parseInt(process.env.PORT, 10) || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});