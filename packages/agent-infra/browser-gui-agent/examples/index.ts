import { ConsoleLogger } from '@agent-infra/logger';
import { BrowserGUIAgent, VlmExtraction, HtmlExtraction } from '../src';
import { LocalScreenshotPlugin } from '../src/plugins/local-screenshot';

export async function main() {
  const logger = new ConsoleLogger('[BrowserGUIAgent]');

  const agent = new BrowserGUIAgent({
    headless: true,
    // preset: 'ui-tars',
    model: {
      baseURL: process.env.VLM_BASE_URL!,
      apiKey: process.env.VLM_API_KEY!,
      model: process.env.VLM_MODEL_NAME as string,
    },
    extractionProvider: new HtmlExtraction(),
    summaryModel: {
      baseURL: process.env.SUMMARY_MODEL_BASE_URL!,
      apiKey: process.env.SUMMARY_MODEL_API_KEY!,
      model: process.env.SUMMARY_MODEL_NAME!,
    },
    logger,
    plugins: [
      new LocalScreenshotPlugin({ logger }),
      // new DumpTracePlugin({ logger }),
    ],
  });

  try {
    console.time('[agent.prepare]');
    await agent.prepare();
    console.timeEnd('[agent.prepare]');

    // const { operationSteps } = await agent.run('What happened to ByteDance recently?');
    // const { operationSteps } = await agent.run('Product hunt 上面有什么新产品？');
    // const { operationSteps } = await agent.run('查看今天 Github Trending 有哪些项目？');
    // const { operationSteps } = await agent.run('Search for "TikTok" on Google');
    const { operationSteps } = await agent.run('Latest news of "TikTok"');
    // const { operationSteps } = await agent.run('open Google');

    // normalize the stream
    logger.infoWithData('operationSteps', operationSteps, (value) => {
      return value.map((step) => {
        return {
          screenshot: '<screenshot>',
          thought: step.thought,
          extraction: step.extraction,
        };
      });
    });
    // normalize the stream

    console.time('[agent.summary]');
    const summaryStream = await agent.summary(operationSteps, { stream: true });

    console.log('--- SUMMARY ---');

    let summary = '';

    for await (const chunk of summaryStream) {
      summary += chunk.choices[0]?.delta?.content || '';
      process.stdout.write(chunk.choices[0]?.delta?.content || '');
    }

    console.log('');
    console.log('--- END ---');

    console.timeEnd('[agent.summary]');

    // await agent.run('Tell me what is the latest Pull Request of UI-TARS-Desktop');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await agent.close();
  }
}

main().catch(console.error);
