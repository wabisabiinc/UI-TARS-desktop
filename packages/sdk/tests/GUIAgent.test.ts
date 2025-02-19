/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { GUIAgent } from '../src/GUIAgent';
import OpenAI from 'openai';
import { Operator } from '../src/types';
import { Jimp } from 'jimp';
import { useContext } from '../src/context/useContext';

const getContext = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn(),
}));

function mockOpenAIResponse(responses: string | string[]) {
  const responseArray = Array.isArray(responses) ? responses : [responses];

  const mockCreate = vi.fn();

  responseArray.forEach((response) => {
    mockCreate.mockImplementationOnce(async () => ({
      choices: [
        {
          message: {
            content: response,
          },
        },
      ],
    }));
  });

  vi.mocked(OpenAI).mockReturnValue({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  } as unknown as OpenAI);
}

class MockOperator extends Operator {
  async screenshot() {
    const image = new Jimp({
      width: 1920,
      height: 1080,
      color: 0xffffffff,
    });
    const buffer = await image.getBuffer('image/png');

    return {
      base64: buffer.toString('base64'),
      width: 1920,
      height: 1080,
      scaleFactor: 1,
    };
  }

  execute = vi.fn().mockImplementation(async () => {
    getContext(useContext());
  });
}

describe('GUIAgent', () => {
  it('normal run', async () => {
    mockOpenAIResponse([
      "Thought: Click on the search bar at the top of the screen\nAction: click(start_box='(72,646)')",
      'Thought: finished.\nAction: finished()',
    ]);
    const modelConfig = {
      baseURL: 'http://localhost:3000/v1',
      apiKey: 'test',
      model: 'ui-tars',
    };
    const operator = new MockOperator();
    const agent = new GUIAgent({
      model: modelConfig,
      operator,
    });

    await agent.run('click the button');

    expect(getContext.mock.calls[0][0]).toMatchObject({
      model: {
        modelConfig,
      },
    });

    expect(operator.execute.mock.calls[0][0]).toEqual({
      parsedPrediction: {
        action_inputs: {
          start_box: '[0.072,0.646,0.072,0.646]',
        },
        action_type: 'click',
        reflection: null,
        thought: 'Click on the search bar at the top of the screen',
      },
      prediction:
        "Thought: Click on the search bar at the top of the screen\nAction: click(start_box='(72,646)')",
      scaleFactor: 1,
      screenHeight: 1080,
      screenWidth: 1920,
    });

    expect(operator.execute.mock.calls[1][0]).toEqual({
      parsedPrediction: {
        action_inputs: {},
        action_type: 'finished',
        reflection: null,
        thought: 'finished.',
      },
      prediction: 'Thought: finished.\nAction: finished()',
      scaleFactor: 1,
      screenHeight: 1080,
      screenWidth: 1920,
    });
  });
});
