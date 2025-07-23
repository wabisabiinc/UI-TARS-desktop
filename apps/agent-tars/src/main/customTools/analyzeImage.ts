import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

export async function analyzeImage(path: string): Promise<string> {
  if (!path) throw new Error('画像パスが未指定です');
  const fileBuffer = readFileSync(path);
  const base64Image = fileBuffer.toString('base64');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'この画像を日本語で説明してください。' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Image}` },
            },
          ],
        },
      ],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('OpenAI Vision API error: ' + errorText);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content ?? '[No content]';
}
