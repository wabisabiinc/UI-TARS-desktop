/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs, { readdirSync } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path, { resolve } from 'node:path';

import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZip } from '@electron-forge/maker-zip';          // ★ 修正①
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

// …（前半のロジックは変更なしなので省略（コメントだけ削除））…

const config: ForgeConfig = {
  packagerConfig: {
    // 省略: 既存設定そのまま
  },
  rebuildConfig: {},
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'wabisabiinc', name: 'UI-TARS-desktop' },
        draft: true,
        force: true,
        generateReleaseNotes: true,
      },
    },
  ],
  makers: [
    /* ----------★ 修正②: MakerZip を正式クラス名で追加 ---------- */
    //   - `platforms` を明示しない場合は全 OS 向け ZIP を出力
    //   - macOS のみで十分なら { platforms: ['darwin'] } と指定
    //
    new MakerZip({ platforms: ['darwin'] }),

    /* Windows */
    new MakerSquirrel({ name: 'UI-TARS', setupIcon: 'resources/icon.ico' }),

    /* macOS DMG */
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
    // …（既存の FusesPlugin 設定そのまま）…
  ],
  hooks: {
    postMake: async (forgeConfig, makeResults) => {
      return await hooks.postMake?.(forgeConfig, makeResults);
    },
  },
};

export default config;
