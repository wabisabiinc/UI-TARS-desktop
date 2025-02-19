/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GUIAgent } from '@ui-tars/sdk';
import * as p from '@clack/prompts';
// import { inspect } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { NutJSOperator } from '@ui-tars/operator-nut-js';

export interface CliOptions {
  presets?: string;
}
export const start = async (options: CliOptions) => {
  const CONFIG_PATH = path.join(os.homedir(), '.ui-tars-cli.json');

  // read config file
  let config = {
    baseURL: '',
    apiKey: '',
    model: '',
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (error) {
    console.warn('read config file failed', error);
    return;
  }
  if (!config.baseURL || !config.apiKey || !config.model) {
    const configAnswers = await p.group(
      {
        baseURL: () => p.text({ message: 'please input vlm model baseURL:' }),
        apiKey: () => p.text({ message: 'please input vlm model apiKey:' }),
        model: () => p.text({ message: 'please input vlm model name:' }),
      },
      {
        onCancel: () => {
          p.cancel('operation cancelled');
          process.exit(0);
        },
      },
    );

    config = { ...config, ...configAnswers };

    // save config to file
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log('model config file saved to:', CONFIG_PATH);
    } catch (error) {
      console.error('save model config file failed', error);
    }
  }

  const answers = await p.group(
    {
      instruction: () => p.text({ message: 'Input your instruction' }),
    },
    {
      onCancel: () => {
        p.cancel('操作已取消');
        process.exit(0);
      },
    },
  );

  const abortController = new AbortController();
  process.on('SIGINT', () => {
    abortController.abort();
  });

  const guiAgent = new GUIAgent({
    model: {
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
    },
    operator: new NutJSOperator(),
    signal: abortController.signal,
    // onData: ({ data }) => {
    // console.log(
    //   '[======data======]',
    //   inspect(data, {
    //     showHidden: false,
    //     depth: null,
    //     colors: true,
    //     maxStringLength: 100,
    //   }),
    // );
    // },
    onError: ({ data, error }) => {
      console.error(error, data);
    },
  });

  await guiAgent.run(answers.instruction);
};
