import fs from 'fs';
import path from 'path';
import { Logger } from '@agent-infra/logger';
import { ParsedPrediction } from '@ui-tars/operator-browser';
import { Plugin, PluginHooks } from './types';

export interface TraceStep {
  timestamp: number;
  type: 'agent' | 'operator' | 'system';
  title: string;
  details: any;
  screenshot?: string;
}

export interface DumpTracePluginOptions {
  outputDir?: string;
  logger?: Logger;
}

export class DumpTracePlugin implements Plugin, PluginHooks {
  readonly name = 'dump-trace';

  private steps: TraceStep[] = [];

  private outputDir: string;

  private logger: Logger;

  private startTime: number;

  constructor(options: DumpTracePluginOptions = {}) {
    this.outputDir = options.outputDir || path.join(process.cwd(), 'traces');
    this.logger = options.logger!.spawn('[DumpTracePlugin]');
    this.startTime = Date.now();
  }

  async init() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    this.addStep('system', 'Plugin Initialized', { timestamp: this.startTime });
  }

  addStep(type: TraceStep['type'], title: string, details: any) {
    this.steps.push({
      timestamp: Date.now(),
      type,
      title,
      details,
    });
  }

  async onAgentData(data: any) {
    this.addStep('agent', 'Agent Data', {
      status: data.status,
      conversations: data.conversations,
    });
  }

  async onScreenshot(screenshot: any) {
    // Add screenshot to the last step
    if (this.steps.length > 0) {
      this.steps[this.steps.length - 1].screenshot = screenshot.base64;
    }
  }

  async onOperatorAction(action: ParsedPrediction) {
    this.addStep('operator', `Executing ${action.action_type}`, {
      action_type: action.action_type,
      action_inputs: action.action_inputs,
      thought: action.thought,
    });
  }

  private generateHTML(): string {
    const stepsHTML = this.steps
      .map((step, index) => {
        const timeElapsed = ((step.timestamp - this.startTime) / 1000).toFixed(
          2,
        );
        const screenshotHTML = step.screenshot
          ? `<img src="data:image/png;base64,${step.screenshot}" style="max-width: 800px; margin-top: 10px;">`
          : '';

        return `
          <div class="step ${step.type}">
            <div class="step-header">
              <span class="step-number">#${index + 1}</span>
              <span class="step-type">${step.type}</span>
              <span class="step-time">${timeElapsed}s</span>
            </div>
            <h3>${step.title}</h3>
            <pre class="step-details">${JSON.stringify(step.details, null, 2)}</pre>
            ${screenshotHTML}
          </div>
        `;
      })
      .join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Browser GUI Agent Trace</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 1200px;
              margin: 0 auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .step {
              background: white;
              border-radius: 8px;
              padding: 15px;
              margin-bottom: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .step-header {
              display: flex;
              gap: 10px;
              margin-bottom: 10px;
            }
            .step-number {
              background: #e0e0e0;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 14px;
            }
            .step-type {
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 14px;
              color: white;
            }
            .agent .step-type { background: #2196f3; }
            .operator .step-type { background: #4caf50; }
            .system .step-type { background: #9e9e9e; }
            .step-time {
              color: #666;
              font-size: 14px;
            }
            .step-details {
              background: #f8f8f8;
              padding: 10px;
              border-radius: 4px;
              overflow-x: auto;
            }
            h3 {
              margin: 10px 0;
              color: #333;
            }
          </style>
        </head>
        <body>
          <h1>Browser GUI Agent Trace</h1>
          <div class="steps">
            ${stepsHTML}
          </div>
        </body>
      </html>
    `;
  }

  async cleanup() {
    this.addStep('system', 'Session Ended', {
      duration: Date.now() - this.startTime,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.outputDir, `trace-${timestamp}.html`);

    fs.writeFileSync(filePath, this.generateHTML());
    this.logger.info(`Trace report saved to: ${filePath}`);
  }
}
