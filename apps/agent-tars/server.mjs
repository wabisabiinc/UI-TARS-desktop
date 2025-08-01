// apps/agent-tars/server.mjs

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OPENAI_API_KEY が未設定です。');
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// ── テスト用
app.post('/api/testModelProvider', (_req, res) => {
  res.json({ success: true });
});

// ── メッセージ生成エンドポイント（テキスト・画像・両方対応）
app.post('/api/generateMessage', async (req, res) => {
  try {
    const {
      model,
      messages,
      functions,
      temperature = 0.3,
      max_tokens = 1500,
    } = req.body;
    // ← messagesを絶対に加工せず、そのまま流す！！
    const completion = await openai.chat.completions.create({
      model,
      messages,
      functions,
      function_call: functions?.length ? 'auto' : undefined,
      temperature,
      max_tokens,
    });
    res.json(completion);
  } catch (err) {
    console.error('generateMessage error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ── 画像＋テキスト指示解析エンドポイント（Vision API対応）
app.post('/api/analyzeImage', async (req, res) => {
  try {
    const { image, prompt } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided.' });
    }
    // Vision対応: content配列で送信
    const userMessage = {
      role: 'user',
      content: [
        { type: 'text', text: prompt || '以下の画像を説明してください。' },
        { type: 'image_url', image_url: { url: image } }
      ]
    };
    const systemPrompt = {
      role: 'system',
      content: 'You are a world‑class visual reasoning AI. You receive a user instruction and an image. Follow the instruction to analyze the image and provide a concise, detailed answer.',
    };
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [systemPrompt, userMessage],
      temperature: 0.2,
      max_tokens: 1000,
    });
    const text = completion.choices?.[0]?.message?.content || '';
    res.json({ success: true, content: text });
  } catch (err) {
    console.error('analyzeImage error:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// モデル一覧取得
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    const names = list.data.map(m => m.id);
    res.json({ success: true, models: names });
  } catch (err) {
    console.error('models list error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 静的ファイル & SPA
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((_, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

// サーバー起動
const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
