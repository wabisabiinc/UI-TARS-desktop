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

const openaiApiKey =
  process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('⚠️ OpenAI API key is not set');
}
const openai = new OpenAI({ apiKey: openaiApiKey });

app.post('/api/analyzeImage', async (req, res) => {
  try {
    const { imageBase64, image } = req.body;
    let dataUrl;
    if (typeof image === 'string') {
      dataUrl = image;
    } else if (typeof imageBase64 === 'string') {
      dataUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
    }
    if (!dataUrl) {
      return res
        .status(400)
        .json({ success: false, error: 'No image provided.' });
    }

    // System プロンプト
    const systemPrompt =
      'You are a world-class image analysis assistant. Provide concise, accurate, and detailed descriptions for the given images.';

    // GPT-4o Vision モデル呼び出し
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: '以下の画像を説明してください。',
          attachments: [
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const text = completion.choices?.[0]?.message?.content || '';
    res.json({ success: true, content: text });
  } catch (err) {
    console.error('analyzeImage error:', err);
    res
      .status(500)
      .json({ success: false, error: err.message || String(err) });
  }
});

// 他のエンドポイントはそのまま…
app.listen(process.env.PORT || 4173, '0.0.0.0');
