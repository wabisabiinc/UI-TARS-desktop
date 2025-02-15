/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { GUIAgent } from '../src/GUIAgent';
import { StatusEnum, ShareVersion } from '@ui-tars/shared/types';

describe('GUIAgent', () => {
  describe('createDataOnChangeProxy', () => {
    it('should handle data changes through proxy', () => {
      const onData = vi.fn();
      const agent = new GUIAgent({
        operator: {} as any,
        model: {} as any,
        onData,
        systemPrompt: 'test system prompt',
      });

      // @ts-ignore
      const data = agent.createDataOnChangeProxy('test instruction');

      expect(onData).not.toHaveBeenCalled();

      data.status = StatusEnum.RUNNING;
      expect(onData.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          conversations: [],
          status: StatusEnum.RUNNING,
        }),
      );

      // test conversation update
      data.conversations.push({
        from: 'gpt',
        value: 'test response',
        timing: {
          start: 1,
          end: 1,
          cost: 0,
        },
      });
      const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0];
      expect(lastCall.data.conversations).toEqual([
        {
          from: 'gpt',
          value: 'test response',
          timing: {
            start: 1,
            end: 1,
            cost: 0,
          },
        },
      ]);
    });

    it('edit conversation cannot trigger onData', () => {
      const onData = vi.fn();
      const agent = new GUIAgent({
        operator: {} as any,
        model: {} as any,
        onData,
        systemPrompt: 'test system prompt',
      });

      // @ts-ignore
      const data = agent.createDataOnChangeProxy('test instruction');

      // append
      data.conversations.push({
        from: 'human',
        value: 'initial message',
        timing: {
          start: 1,
          end: 1,
          cost: 0,
        },
      });

      // edit
      data.conversations[0].value = 'modified message';

      const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0];
      expect(lastCall.data.conversations).toEqual([
        {
          from: 'human',
          value: 'initial message',
          timing: {
            start: 1,
            end: 1,
            cost: 0,
          },
        },
      ]);
    });

    it('pop conversation cannot trigger onData', () => {
      const onData = vi.fn();
      const agent = new GUIAgent({
        operator: {} as any,
        model: {} as any,
        onData,
        systemPrompt: 'test system prompt',
      });

      // @ts-ignore
      const data = agent.createDataOnChangeProxy('test instruction');

      // append
      data.conversations.push(
        ...[
          {
            from: 'gpt' as const,
            value: 'initial message',
            timing: {
              start: 1,
              end: 1,
              cost: 0,
            },
          },
          {
            from: 'human' as const,
            value: 'message_2',
            timing: {
              start: 1,
              end: 1,
              cost: 0,
            },
          },
        ],
      );

      data.conversations.pop();

      expect(data.conversations.slice(1)).toEqual([
        {
          from: 'gpt',
          value: 'initial message',
          timing: {
            start: 1,
            end: 1,
            cost: 0,
          },
        },
      ]);

      const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0];
      expect(lastCall.data.conversations).toEqual([
        {
          from: 'gpt',
          value: 'initial message',
          timing: {
            start: 1,
            end: 1,
            cost: 0,
          },
        },
        {
          from: 'human',
          value: 'message_2',
          timing: {
            start: 1,
            end: 1,
            cost: 0,
          },
        },
      ]);
    });

    it('should handle status and errMsg both update', () => {
      const onData = vi.fn();
      const agent = new GUIAgent({
        operator: {} as any,
        model: {} as any,
        onData,
        systemPrompt: 'test system prompt',
      });

      // @ts-ignore
      const data = agent.createDataOnChangeProxy('test instruction');

      Object.assign(data, {
        status: StatusEnum.MAX_LOOP,
        errMsg: 'Exceeds the maximum number of loops',
      });

      // only trigger once
      expect(onData.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          conversations: [],
          status: StatusEnum.MAX_LOOP,
        }),
      );
      expect(onData.mock.calls[1][0].data).toEqual(
        expect.objectContaining({
          conversations: [],
          errMsg: 'Exceeds the maximum number of loops',
        }),
      );
    });
  });
});
