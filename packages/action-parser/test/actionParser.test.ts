/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { parseActionVlm } from '../src/actionParser';

describe('parseActionVlm', () => {
  // BC mode tests
  describe('BC mode', () => {
    it('should correctly parse input with Thought', () => {
      const input = `Thought: I need to click this button
Action: click(start_box='(100,200)')`;

      const result = parseActionVlm(input);

      expect(result).toEqual([
        {
          reflection: null,
          thought: 'I need to click this button',
          action_type: 'click',
          action_inputs: {
            start_box: '[0.1,0.2,0.1,0.2]',
          },
        },
      ]);
    });

    it('should correctly parse input with Thought custom factors', () => {
      const input = `Thought: I need to click this button
Action: click(start_box='(100,200)')`;

      const result = parseActionVlm(input, [1366, 768]);

      expect(result).toEqual([
        {
          reflection: null,
          thought: 'I need to click this button',
          action_type: 'click',
          action_inputs: {
            start_box:
              '[0.07320644216691069,0.2604166666666667,0.07320644216691069,0.2604166666666667]',
          },
        },
      ]);
    });

    it('should correctly parse input with Reflection and Action_Summary', () => {
      const input = `Reflection: This is a reflection
Action_Summary: This is a summary
Action: type(text='Hello', start_box='(300,400)')`;

      const result = parseActionVlm(input);

      expect(result).toEqual([
        {
          reflection: 'This is a reflection',
          thought: 'This is a summary',
          action_type: 'type',
          action_inputs: {
            text: 'Hello',
            start_box: '[0.3,0.4,0.3,0.4]',
          },
        },
      ]);
    });

    it('should handle multiple actions', () => {
      const input = `Thought: Perform multiple actions
Action: click(start_box='(100,200)')

type(text='Hello', start_box='(300,400)')`;

      const result = parseActionVlm(input);

      expect(result).toEqual([
        {
          thought: 'Perform multiple actions',
          reflection: null,
          action_type: 'click',
          action_inputs: {
            start_box: '[0.1,0.2,0.1,0.2]',
          },
        },
        {
          thought: 'Perform multiple actions',
          reflection: null,
          action_type: 'type',
          action_inputs: {
            text: 'Hello',
            start_box: '[0.3,0.4,0.3,0.4]',
          },
        },
      ]);
    });
  });

  // O1 mode tests
  describe('O1 mode', () => {
    it('should correctly parse O1 format input', () => {
      const input = `<Thought>I need to perform this action</Thought>
Action_Summary: Click and type text
Action: click(start_box='(100,200)')
</Output>`;

      const result = parseActionVlm(input, [1000, 1000], 'o1');

      expect(result).toEqual([
        {
          reflection: null,
          thought:
            'I need to perform this action\n<Action_Summary>\nClick and type text',
          action_type: 'click',
          action_inputs: {
            start_box: '[0.1,0.2,0.1,0.2]',
          },
        },
      ]);
    });

    it('should handle complex O1 format input', () => {
      const input = `<Thought>Complex operation</Thought>
Action_Summary: Multiple sequential actions
Action: click(start_box='(100,200)')
</Output>`;

      const result = parseActionVlm(input, [1000, 1000], 'o1');

      expect(result).toEqual([
        {
          reflection: null,
          thought:
            'Complex operation\n<Action_Summary>\nMultiple sequential actions',
          action_type: 'click',
          action_inputs: {
            start_box: '[0.1,0.2,0.1,0.2]',
          },
        },
      ]);
    });
  });

  // Edge cases
  describe('Edge cases', () => {
    it('should handle input without Action keyword', () => {
      const input = 'click(start_box="(100,200)")';
      const result = parseActionVlm(input);

      expect(result).toEqual([
        {
          action_inputs: {
            start_box: '[0.1]',
          },
          action_type: 'click',
          reflection: null,
          thought: '',
        },
      ]);
    });

    it('should handle empty action input', () => {
      const input = 'Thought: Empty action\nAction:';
      const result = parseActionVlm(input);

      expect(result).toEqual([
        {
          action_inputs: {},
          action_type: '',
          reflection: null,
          thought: 'Empty action',
        },
      ]);
    });
  });

  describe('Box coordinates normalization', () => {
    it('should correctly normalize box with four coordinates using custom factors', () => {
      const input = `Thought: I need to click on this element
Action: click(start_box='[348, 333, 928, 365]')`;

      const result = parseActionVlm(input, [1366, 768]);

      expect(result).toEqual([
        {
          reflection: null,
          thought: 'I need to click on this element',
          action_type: 'click',
          action_inputs: {
            // Verify that x1, y1, x2, y2 are all normalized correctly
            // x1 = 348/1366, y1 = 333/768, x2 = 928/1366, y2 = 365/768
            start_box:
              '[0.2547584187408492,0.43359375,0.6793557833089312,0.4752604166666667]',
          },
        },
      ]);
    });

    it('should handle real-world screen dimensions with four coordinates', () => {
      const input = `Thought: I need to click on this element in the browser
Action: click(start_box='[287, 111, 313, 124]')`;

      const result = parseActionVlm(input, [1280, 800]);

      expect(result).toEqual([
        {
          reflection: null,
          thought: 'I need to click on this element in the browser',
          action_type: 'click',
          action_inputs: {
            // Verify the normalized results at the actual screen size
            // x1 = 287/1280, y1 = 111/800, x2 = 313/1280, y2 = 124/800
            start_box: '[0.22421875,0.13875,0.24453125,0.155]',
          },
        },
      ]);
    });
  });
});
