import { readFileSync } from 'fs';
import path from 'node:path';
import fetch from 'node-fetch';

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

// 拡張子から雑に MIME を推定
function guessMime(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

export async function analyzeImage(filePath: string): Promise<string> {
  if (!filePath) throw new Error('画像パスが未指定です');
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY が未設定です');

  const fileBuffer = readFileSync(filePath);
  const base64Image = fileBuffer.toString('base64');
  const mime = guessMime(filePath);

  const payload = {
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'この画像を日本語で説明してください。' },
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 1024,
  } as const;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[analyzeImage] OpenAI error:', errorText);
    throw new Error('OpenAI Vision API error');
  }

  const result = await response.json();
  const text =
    result?.choices?.[0]?.message?.content ??
    result?.choices?.[0]?.message?.text ??
    '';

  return text || '[No content]';
}
