/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import fs, { readdirSync } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path, { resolve } from 'node:path';

import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZip } from '@electron-forge/maker-zip'; // ← ★ MakerZip だけ残す
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import setLanguages from 'electron-packager-languages';
import { rimraf, rimrafSync } from 'rimraf';

import pkg from './package.json';
import { getExternalPkgs } from './scripts/getExternalPkgs';
import {
  getModuleRoot,
  getExternalPkgsDependencies,
  hooks,
} from '@common/electron-build';

/* ───── 途中のビルド用ユーティリティ関数・定数は元ファイルと同じなので省略 ───── */

const config: ForgeConfig = {
  packagerConfig: {
    name: 'UI TARS',
    icon: 'resources/icon',
    extraResource: ['./resources/app-update.yml'],
    asar: {
      /* unpack 設定など元のまま */
    },
    /* 以降の packagerConfig も元のまま */
  },

  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'wabisabiinc', name: 'UI-TARS-desktop' },
        draft: true,
        generateReleaseNotes: true,
      },
    },
  ],

  /* ★ makers 配列をシンプルに：MakerZip が linux/darwin/win32 すべてカバー */
  makers: [
    new MakerZip(), // Linux も ZIP でビルド
    new MakerSquirrel({ name: 'UI-TARS', setupIcon: 'resources/icon.ico' }),
    new MakerDMG({
      overwrite: true,
      background: 'static/dmg-background.png',
      iconSize: 160,
      format: 'UDZO',
      additionalDMGOptions: { window: { size: { width: 660, height: 400 } } },
      contents: (opts) => [
        { x: 180, y: 170, type: 'file', path: opts.appPath },
        { x: 480, y: 170, type: 'link', path: '/Applications' },
      ],
    }),
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),
    /* 既存の FusesPlugin 設定はそのまま */
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],

  hooks: {
    postMake: async (forgeConfig, makeResults) =>
      hooks.postMake?.(forgeConfig, makeResults),
  },
};

export default config;
