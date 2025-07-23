import { ToolCall } from '@agent-infra/shared';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

export async function analyzeImage(toolCall: ToolCall): Promise<string> {
  try {
    const args = JSON.parse(toolCall.function.arguments || '{}');
    const imagePath = args.path;
    if (!imagePath) throw new Error('No image path specified');

    const fileBuffer = readFileSync(imagePath);
    const base64Image = fileBuffer.toString('base64');

    // gpt-4-vision-preview でも gpt-4o でも "content"配列で画像を渡す
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
    // OpenAIのレスポンス形式でテキスト抽出
    return result.choices?.[0]?.message?.content ?? '[No content]';
  } catch (err) {
    return `画像認識エラー: ${err}`;
  }
}
