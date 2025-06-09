// apps/agent-tars/server.mjs
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { Client as GeminiClient} from '@google/genai';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 追加①：JSON ボディパース
app.use(express.json());

// 追加②：環境変数からキーを取得
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GeminiClient({ apiKey: process.env.GEMINI_API_KEY });

// 追加③：/api/askLLMTool エンドポイント
app.post('/api/askLLMTool', async (req, res) => {
  const { model, messages, tools } = req.body;
  try {
    if (model.startsWith('gpt')) {
      const response = await openai.chat.completions.create({
        model,
        messages,
        functions: tools,
        function_call: 'auto',
      });
      const msg = response.choices[0].message;
      return res.json({
        tool_calls: msg.function_call ? [{ function: msg.function_call }] : [],
        content: msg.content,
      });
    } else if (model.startsWith('gemini')) {
      const prompt = messages.map((m) => m.content || '').join('\n');
      const response = await gemini.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
      });
      return res.json({ tool_calls: [], content: response.text });
    } else {
      return res.status(400).json({ error: 'Unsupported model' });
    }
  } catch (e) {
    console.error('LLM proxy error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist/web')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/web/index.html'));
});

const port = process.env.PORT || 4173;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});