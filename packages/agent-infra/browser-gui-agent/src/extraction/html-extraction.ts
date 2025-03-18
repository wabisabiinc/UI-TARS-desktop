import { READABILITY_SCRIPT, toMarkdown } from '@agent-infra/shared';
import { Extraction, ExtractionResult, ExtractionContext } from './types';

interface PageInfo {
  title: string;
  content: string;
}

/**
 * Executing directly on an existing page will cause the page to lose its style
 * We need to find a better solution, which may have performance issues
 */
export function extractPageInformationWithClone(
  window: Window,
  readabilityScript: string,
): PageInfo {
  const Readability = new Function(
    'module',
    `${readabilityScript}\nreturn module.exports`,
  )({});

  const documentClone = window.document.cloneNode(true) as Document;
  documentClone
    .querySelectorAll(
      'script,noscript,style,link,svg,img,video,iframe,canvas,.reflist',
    )
    .forEach((el) => el.remove());

  const article = new Readability(documentClone).parse();
  const content = article?.content || '';
  const title = window.document.title;

  return {
    content,
    title: article?.title || title,
  };
}

export class HtmlExtraction extends Extraction<ExtractionResult> {
  override async extract(
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    const winHandle = await context.page.evaluateHandle(() => window);
    console.time('extractPageInformationWithClone');
    await context.page.waitForFrame(() => true);
    const result = await context.page.evaluate(
      extractPageInformationWithClone,
      winHandle,
      READABILITY_SCRIPT,
    );
    console.timeEnd('extractPageInformationWithClone');
    return {
      ...result,
      content: toMarkdown(result.content),
    };
  }
}
