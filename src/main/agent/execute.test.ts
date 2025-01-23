import {
  Button,
  Key,
  Point,
  Region,
  centerOf,
  keyboard,
  mouse,
  straightTo,
} from '@computer-use/nut-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecuteParams, execute } from './execute';

// Mock @computer-use/nut-js
vi.mock('@computer-use/nut-js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    mouse: {
      move: vi.fn(),
      click: vi.fn(),
      config: {
        mouseSpeed: 1500,
      },
      drag: vi.fn(),
    },
    Key: actual.Key,
    keyboard: {
      type: vi.fn(),
      pressKey: vi.fn(),
      releaseKey: vi.fn(),
      config: {
        autoDelayMs: 0,
      },
    },
    Button: {
      LEFT: 'left',
      RIGHT: 'right',
      MIDDLE: 'middle',
    },
    Point: actual.Point,
    Region: actual.Region,
    straightTo: vi.fn((point) => point),
    centerOf: vi.fn((region) => region),
    randomPointIn: vi.fn((region) => region),
    sleep: vi.fn(),
  };
});

describe('execute', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Click on the search bar at the top of the screen', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought: 'Click on the search bar at the top of the screen\n',
        action_type: 'click',
        action_inputs: {
          start_box: '[0.072,0.646,0.072,0.646]',
        },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1,
    };

    await execute(executeParams);

    expect(mouse.move).toHaveBeenCalledWith(
      straightTo(new Point(138.24, 697.68)),
    );

    expect(mouse.click).toHaveBeenCalledWith(Button.LEFT);
  });

  it('Click on the search bar at the top of the screen with scaleFactor', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought: 'Click on the search bar at the top of the screen\n',
        action_type: 'click',
        action_inputs: {
          start_box: '[0.072,0.646,0.072,0.646]',
        },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1.5,
    };

    await execute(executeParams);

    expect(mouse.move).toHaveBeenCalledWith(
      straightTo(new Point(207.36, 1046.52)),
    );

    expect(mouse.click).toHaveBeenCalledWith(Button.LEFT);
  });

  it('type doubao.com\n', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought:
          'To proceed with the task of accessing doubao.com, I need to type the URL into the address bar. This will allow me to navigate to the website and continue with the subsequent steps of the task.\n' +
          `Type "doubao.com" into the browser's address bar.`,
        action_type: 'type',
        action_inputs: { content: 'doubao.com\\n' },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1,
    };

    await execute(executeParams);

    expect(keyboard.type).toHaveBeenCalledWith('doubao.com');
    expect(keyboard.pressKey).toHaveBeenCalledWith(Key.Enter);
  });

  it('type doubao.com', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought:
          'To proceed with the task of accessing doubao.com, I need to type the URL into the address bar. This will allow me to navigate to the website and continue with the subsequent steps of the task.\n' +
          `Type "doubao.com" into the browser's address bar.`,
        action_type: 'type',
        action_inputs: { content: 'doubao.com' },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1,
    };

    await execute(executeParams);

    expect(keyboard.type).toHaveBeenCalledWith('doubao.com');
    expect(keyboard.pressKey).not.toHaveBeenCalledWith(Key.Enter);
  });

  it('type Hello World\nUI-TARS\n', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought:
          'To proceed with the task of accessing doubao.com, I need to type the URL into the address bar. This will allow me to navigate to the website and continue with the subsequent steps of the task.\n' +
          `Type "Hello World\nUI-TARS\n" into the browser's address bar.`,
        action_type: 'type',
        action_inputs: { content: 'Hello World\\nUI-TARS\\n' },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1,
    };

    await execute(executeParams);

    expect(keyboard.type).toHaveBeenCalledWith('Hello World\\nUI-TARS');
    expect(keyboard.pressKey).toHaveBeenCalledWith(Key.Enter);
  });

  it('drag slider horizontally', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought:
          'To narrow down the search results to cat litters within the specified price range of $18 to $32, I need to adjust the price filter. The next logical step is to drag the left handle of the price slider to set the minimum price to $18, ensuring that only products within the desired range are displayed.\n' +
          'Drag the left handle of the price slider to set the minimum price to $18.',
        action_type: 'drag',
        action_inputs: {
          start_box: '[0.072,0.646,0.072,0.646]',
          end_box: '[0.175,0.647,0.175,0.647]',
        },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1,
    };

    await execute(executeParams);

    expect(mouse.drag).toHaveBeenCalledWith(
      straightTo(centerOf(new Region(138.24, 697.68, 197.76, 1.08))),
    );
  });

  it('drag slider vertically', async () => {
    const executeParams: ExecuteParams = {
      prediction: {
        reflection: '',
        thought:
          'To narrow down the search results to cat litters within the specified price range of $18 to $32, I need to adjust the price filter. The next logical step is to drag the left handle of the price slider to set the minimum price to $18, ensuring that only products within the desired range are displayed.\n' +
          'Drag the left handle of the price slider to set the minimum price to $18.',
        action_type: 'drag',
        action_inputs: {
          start_box: '[0.072,0.646,0.072,0.646]',
          end_box: '[0.072,0.546,0.072,0.546]',
        },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      logger: mockLogger,
      scaleFactor: 1,
    };

    await execute(executeParams);

    expect(mouse.drag).toHaveBeenCalledWith(
      straightTo(centerOf(new Region(138.24, 697.68, 0, -108))),
    );
  });
});
