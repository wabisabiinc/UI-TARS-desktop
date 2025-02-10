/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { electronApp, optimizer } from '@electron-toolkit/utils';
import {
  app,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  session,
} from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import ElectronStore from 'electron-store';
import { UpdateSourceType, updateElectronApp } from 'update-electron-app';
import { mainZustandBridge } from 'zutron/main';

import * as env from '@main/env';
import { logger } from '@main/logger';
import {
  LauncherWindow,
  createMainWindow,
  createSettingsWindow,
} from '@main/window/index';

import { UTIOService } from './services/utio';
import { store } from './store/create';
import { SettingStore } from './store/setting';
import { createTray } from './tray';

const { isProd } = env;

// 在应用初始化之前启用辅助功能支持
app.commandLine.appendSwitch('force-renderer-accessibility');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

logger.debug('[env]', env);

ElectronStore.initRenderer();

class AppUpdater {
  constructor() {
    // autoUpdater.logger = logger;
    // autoUpdater.checkForUpdatesAndNotify();
    if (!env.isE2eTest) {
      updateElectronApp({
        updateSource: {
          type: UpdateSourceType.ElectronPublicUpdateService,
          repo: 'bytedance/UI-TARS-desktop',
          host: 'https://update.electronjs.org',
        },
        updateInterval: '10 minutes',
        logger,
      });
    }
  }
}

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (isProd) {
  import('source-map-support').then(({ default: sourceMapSupport }) => {
    sourceMapSupport.install();
  });
}

const loadDevDebugTools = async () => {
  import('electron-debug').then(({ default: electronDebug }) => {
    electronDebug({ showDevTools: false });
  });

  import('electron-devtools-installer')
    .then(({ default: installExtensionDefault, REACT_DEVELOPER_TOOLS }) => {
      // @ts-ignore
      const installExtension = installExtensionDefault?.default;
      const extensions = [installExtension(REACT_DEVELOPER_TOOLS)];

      return Promise.all(extensions)
        .then((names) => logger.info('Added Extensions:', names.join(', ')))
        .catch((err) =>
          logger.error('An error occurred adding extension:', err),
        );
    })
    .catch(logger.error);
};

const initializeApp = async () => {
  const isAccessibilityEnabled = app.isAccessibilitySupportEnabled();
  logger.info('isAccessibilityEnabled', isAccessibilityEnabled);
  if (env.isMacOS) {
    app.setAccessibilitySupportEnabled(true);
    const { ensurePermissions } = await import('@main/utils/systemPermissions');

    const ensureScreenCapturePermission = ensurePermissions();
    logger.info('ensureScreenCapturePermission', ensureScreenCapturePermission);
  }

  // if (isDev) {
  await loadDevDebugTools();
  // }

  logger.info('createTray');
  // Tray
  await createTray();

  // Send app launched event
  await UTIOService.getInstance().appLaunched();

  const launcherWindowIns = LauncherWindow.getInstance();

  globalShortcut.register('Alt+T', () => {
    launcherWindowIns.show();
  });

  logger.info('createMainWindow');
  const mainWindow = createMainWindow();
  const settingsWindow = createSettingsWindow({
    showInBackground: true,
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        // Grant access to the first screen found.
        callback({ video: sources[0], audio: 'loopback' });
      });
      // If true, use the system picker if available.
      // Note: this is currently experimental. If the system picker
      // is available, it will be used and the media request handler
      // will not be invoked.
    },
    { useSystemPicker: true },
  );

  logger.info('mainZustandBridge');

  const { unsubscribe } = mainZustandBridge(
    ipcMain,
    store,
    [
      mainWindow,
      settingsWindow,
      ...(launcherWindowIns.getWindow()
        ? [launcherWindowIns.getWindow()!]
        : []),
    ],
    {
      // reducer: rootReducer,
    },
  );

  app.on('quit', unsubscribe);

  logger.info('initializeApp end');

  // Check and update remote presets
  const settings = SettingStore.getStore();
  if (
    settings.presetSource?.type === 'remote' &&
    settings.presetSource.autoUpdate
  ) {
    try {
      await SettingStore.importPresetFromUrl(settings.presetSource.url!, true);
    } catch (error) {
      logger.error('Failed to update preset:', error);
    }
  }
};

/**
 * Register IPC handlers
 */
const registerIPCHandlers = () => {
  ipcMain.handle('utio:shareReport', async (_, params) => {
    await UTIOService.getInstance().shareReport(params);
  });

  ipcMain.handle('get-screen-size', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      screenWidth: primaryDisplay.size.width,
      screenHeight: primaryDisplay.size.height,
    };
  });

  ipcMain.handle('setting:importPresetFromFile', async (_, yamlContent) => {
    await SettingStore.importPresetFromText(yamlContent);
    return SettingStore.getStore();
  });

  ipcMain.handle('setting:importPresetFromUrl', async (_, url, autoUpdate) => {
    await SettingStore.importPresetFromUrl(url, autoUpdate);
    return SettingStore.getStore();
  });

  ipcMain.handle('setting:updatePresetFromRemote', async () => {
    const settings = SettingStore.getStore();
    if (settings.presetSource?.type === 'remote' && settings.presetSource.url) {
      await SettingStore.importPresetFromUrl(
        settings.presetSource.url,
        settings.presetSource.autoUpdate,
      );
      return SettingStore.getStore();
    } else {
      throw new Error('No remote preset configured');
    }
  });

  ipcMain.handle('setting:resetPreset', async () => {
    SettingStore.resetPreset();
    return SettingStore.getStore();
  });

  ipcMain.handle('setting:clear', async () => {
    SettingStore.clear();
  });
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    electronApp.setAppUserModelId('com.electron');

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    await initializeApp();

    registerIPCHandlers();

    logger.info('app.whenReady end');
  })
  .catch(console.log);

// ... 保留其他代码 ...
