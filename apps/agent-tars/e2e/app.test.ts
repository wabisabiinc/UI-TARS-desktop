/**
 * Copyright (c) 2025 Bytedance, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ElectronApplication,
  Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // 1) 最終的なビルド先ディレクトリを探す
  const latestBuild = findLatestBuild();

  // 2) ビルド先から実行ファイルパスとメインスクリプトパスを取得
  const { executable: executablePath, main } = parseElectronApp(latestBuild);
  console.log('executablePath:', executablePath);
  console.log('main script:', main);

  // 環境変数を設定（必要なら）
  process.env.CI = 'e2e';

  // 3) Electron を起動
  electronApp = await electron.launch({
    executablePath,
    args: [main],
    env: {
      ...process.env,
      CI: 'e2e',
    },
  });

  // 4) 最初のウィンドウが生成されるのを待つ
  //    タイムアウトは必要に応じて調整 (例: 60000ms)
  page = await electronApp.waitForEvent('window', { timeout: 60_000 });

  console.log('First window URL:', page.url());

  // 5) ウィンドウが開いたあとのログキャプチャを設定しておく
  page.on('pageerror', (error) => {
    console.error('pageerror:', error);
  });
  page.on('console', (msg) => {
    console.log('console:', msg.text());
  });
});

test.afterAll(async () => {
  // テスト終了後はアプリをクローズ
  await electronApp?.close();
});

test('app can launch and show button', async () => {
  // ページが DOMContentLoaded になるのを待つ
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 });

  // 例として、画面上に <button> が表示されることを検証する
  const buttonElement = await page.waitForSelector('button', {
    state: 'visible',
    timeout: 60_000,
  });
  expect(await buttonElement.isVisible()).toBe(true);
});
