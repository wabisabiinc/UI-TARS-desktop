import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const openaiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) console.error('⚠️ OPENAI_API_KEY が未設定です。');
const openai = new OpenAI({ apiKey: openaiApiKey });

// — メッセージ生成 —
app.post('/api/generateMessage', async (req, res) => {
  try {
    const {
      model,
      messages,
      functions,
      temperature = 0.3,
      max_tokens = 1500,
    } = req.body;
    // システムプロンプトの挿入
    const systemPrompt = {
      role: 'system',
      content:
        'You are a domain‑expert AI assistant. Provide concise, authoritative, ' +
        'and richly detailed answers. Cite examples or data where possible.',
    };
    const chatMessages = [systemPrompt, ...messages];
    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      functions,
      function_call: 'auto',
      temperature,
      max_tokens,
    });
    res.json(completion);
  } catch (err) {
    console.error('generateMessage error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// — 画像解析 —
app.post('/api/analyzeImage', async (req, res) => {
  try {
    const { image, imageBase64 } = req.body;
    let dataUrl;
    if (typeof image === 'string') {
      dataUrl = image;
    } else if (typeof imageBase64 === 'string') {
      dataUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
    }
    if (!dataUrl) {
      return res.status(400).json({ success: false, error: 'No image.' });
    }

    const systemPrompt = {
      role: 'system',
      content:
        'You are a world‑class visual reasoning AI. Describe what you see in ' +
        '3–5 structured paragraphs, including objects, relationships, text, and context.',
    };
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        systemPrompt,
        { role: 'user', content: `Analyze this image:\n${dataUrl}` },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const text = completion.choices?.[0]?.message?.content || '';
    res.json({ success: true, content: text });
  } catch (err) {
    console.error('analyzeImage error:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// — その他エンドポイント —
app.get('/api/models', async (_req, res) => {
  try {
    const list = await openai.models.list();
    res.json({ success: true, models: list.data.map((m) => m.id) });
  } catch (err) {
    console.error('models list error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// SPA フォールバック
app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

app.listen(process.env.PORT || 4173, '0.0.0.0', () => {
  console.log('Server listening on port', process.env.PORT || 4173);
});
