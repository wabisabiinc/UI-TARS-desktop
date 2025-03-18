import { OpenAI } from 'openai';
import { Extraction, ExtractionContext } from './types';
import { ModelConfig } from '../types';

export interface VlmExtractionOptions extends ModelConfig {
  // TODO: Support streaming extraction.
  // stream?: boolean;
}
export class VlmExtraction extends Extraction {
  private client: OpenAI;

  constructor(private options: VlmExtractionOptions) {
    super();
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  override async extract(context: ExtractionContext) {
    const response = await this.client.chat.completions.create({
      model: this.options.model,
      messages: [
        {
          role: 'system',
          content:
            'Extract key information from the screenshot and format it in Markdown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract key information from this image:' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${context.screenshot}` },
            },
          ],
        },
      ],
    });
    return {
      content: response.choices[0].message?.content || '',
    };
  }
}
