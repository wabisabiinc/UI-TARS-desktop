/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  hasPromptedForPermission,
  hasScreenCapturePermission,
  openSystemPreferences,
} from '@computer-use/mac-screen-capture-permissions';
import permissions from '@computer-use/node-mac-permissions';

import * as env from '@main/env';
import { logger } from '@main/logger';

let hasScreenRecordingPermission = false;
let hasAccessibilityPermission = false;

const wrapWithWarning =
  (message, nativeFunction) =>
  (...args) => {
    console.warn(message);
    return nativeFunction(...args);
  };

const askForAccessibility = (nativeFunction, functionName) => {
  if (process.platform !== 'darwin' || hasAccessibilityPermission) {
    return nativeFunction;
  }
  const accessibilityStatus = permissions.getAuthStatus('accessibility');
  logger.info('[accessibilityStatus]', accessibilityStatus);

  if (accessibilityStatus === 'authorized') {
    hasAccessibilityPermission = true;
    return nativeFunction;
  } else if (
    accessibilityStatus === 'not determined' ||
    accessibilityStatus === 'denied'
  ) {
    permissions.askForAccessibilityAccess();
    return wrapWithWarning(
      `##### WARNING! The application running this script tries to access accessibility features to execute ${functionName}! Please grant requested access and visit https://github.com/nut-tree/nut.js#macos for further information. #####`,
      nativeFunction,
    );
  }
};
const askForScreenRecording = (nativeFunction, functionName) => {
  if (process.platform !== 'darwin' || hasScreenRecordingPermission) {
    return nativeFunction;
  }
  const screenCaptureStatus = permissions.getAuthStatus('screen');

  if (screenCaptureStatus === 'authorized') {
    hasScreenRecordingPermission = true;
    return nativeFunction;
  } else if (
    screenCaptureStatus === 'not determined' ||
    screenCaptureStatus === 'denied'
  ) {
    permissions.askForScreenCaptureAccess();
    return wrapWithWarning(
      `##### WARNING! The application running this script tries to screen recording features to execute ${functionName}! Please grant the requested access and visit https://github.com/nut-tree/nut.js#macos for further information. #####`,
      nativeFunction,
    );
  }
};

export const ensurePermissions = (): {
  screenCapture: boolean;
  accessibility: boolean;
} => {
  if (env.isE2eTest) {
    return {
      screenCapture: true,
      accessibility: true,
    };
  }

  logger.info(
    '[ensurePermissions] hasScreenRecordingPermission',
    hasScreenRecordingPermission,
    'hasAccessibilityPermission',
    hasAccessibilityPermission,
  );
  if (hasScreenRecordingPermission && hasAccessibilityPermission) {
    return {
      screenCapture: true,
      accessibility: true,
    };
  }

  logger.info('Has asked permissions?', hasPromptedForPermission());

  hasScreenRecordingPermission = hasScreenCapturePermission();
  logger.info('Has permissions?', hasScreenRecordingPermission);
  logger.info('Has asked permissions?', hasPromptedForPermission());

  if (!hasScreenRecordingPermission) {
    openSystemPreferences();
  }

  askForAccessibility(() => {}, '执行无障碍操作');
  askForScreenRecording(() => {}, '执行屏幕录制操作');

  return {
    screenCapture: hasScreenRecordingPermission,
    accessibility: hasAccessibilityPermission,
  };
};
