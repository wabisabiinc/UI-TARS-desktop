/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs, { readdirSync } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path, { resolve } from 'node:path';
import { execSync } from 'node:child_process';

import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import setLanguages from 'electron-packager-languages';
import { rimraf, rimrafSync } from 'rimraf';
import pkg from './package.json';

const keepModules = new Set([...Object.keys(pkg.dependencies)]);
const keepLanguages = new Set(['en', 'en_GB', 'en-US', 'en_US']);
const noopAfterCopy = (
  _buildPath,
  _electronVersion,
  _platform,
  _arch,
  callback,
) => callback();

const enableOsxSign =
  process.env.APPLE_ID &&
  process.env.APPLE_PASSWORD &&
  process.env.APPLE_TEAM_ID;

// remove folders & files not to be included in the app
async function cleanSources(
  buildPath,
  _electronVersion,
  platform,
  _arch,
  callback,
) {
  // folders & files to be included in the app
  const appItems = new Set([
    'dist',
    'node_modules',
    'package.json',
    'resources',
  ]);

  if (platform === 'darwin' || platform === 'mas') {
    const frameworkResourcePath = resolve(
      buildPath,
      '../../Frameworks/Electron Framework.framework/Versions/A/Resources',
    );

    for (const file of readdirSync(frameworkResourcePath)) {
      if (file.endsWith('.lproj') && !keepLanguages.has(file.split('.')[0]!)) {
        rimrafSync(resolve(frameworkResourcePath, file));
      }
    }
  }

  // Keep only node_modules to be included in the app
  await Promise.all([
    ...(await readdir(buildPath).then((items) =>
      items
        .filter((item) => !appItems.has(item))
        .map((item) => rimraf(path.join(buildPath, item))),
    )),
    ...(await readdir(path.join(buildPath, 'node_modules')).then((items) =>
      items
        .filter((item) => !keepModules.has(item))
        .map((item) => rimraf(path.join(buildPath, 'node_modules', item))),
    )),
  ]);

  const installedDepsPath = path.join(__dirname, 'installedDeps');
  try {
    console.log('Installing dependencies in installedDeps directory...');
    execSync('pnpm i --ignore-workspace --prod', {
      cwd: installedDepsPath,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    throw error;
  }

  await cp(
    path.join(installedDepsPath, 'node_modules'),
    path.join(buildPath, 'node_modules'),
    { recursive: true },
  );
  // copy needed node_modules to be included in the app
  await Promise.all(
    Array.from(keepModules.values()).map((item) => {
      // Check is exist
      if (fs.existsSync(path.join(buildPath, 'node_modules', item))) {
        // eslint-disable-next-line array-callback-return
        return;
      }

      if (fs.existsSync(path.join(__dirname, 'node_modules', item))) {
        console.log(
          'copy_current_node_modules',
          path.join(__dirname, 'node_modules', item),
        );
        return cp(
          path.join(__dirname, 'node_modules', item),
          path.join(buildPath, 'node_modules', item),
          { recursive: true },
        );
      }

      console.log(
        'copy root_node_modules',
        path.join(process.cwd(), '../../node_modules', item),
      );
      return cp(
        path.join(process.cwd(), '../../node_modules', item),
        path.join(buildPath, 'node_modules', item),
        {
          recursive: true,
        },
      );
    }),
  );

  callback();
}

const ignorePattern = new RegExp(
  `^/node_modules/(?!${[...keepModules].join('|')})`,
);

console.log('ignorePattern', ignorePattern);

const config: ForgeConfig = {
  packagerConfig: {
    name: 'UI TARS',
    icon: 'resources/icon',
    asar: {
      unpack:
        '**/node_modules/{sharp,@img,@computer-use/node-mac-permissions}/**/*',
    },
    ignore: [ignorePattern],
    prune: false,
    afterCopy: [
      cleanSources,
      process.platform !== 'win32'
        ? noopAfterCopy
        : setLanguages([...keepLanguages.values()]),
    ],
    executableName: 'UI-TARS',
    extraResource: ['./resources/app-update.yml'],
    ...(enableOsxSign
      ? {
          osxSign: {
            keychain: process.env.KEYCHAIN_PATH,
            optionsForFile: () => ({
              entitlements: 'build/entitlements.mac.plist',
            }),
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }
      : {}),
  },
  rebuildConfig: {
    force: true,
  },
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'bytedance', name: 'ui-tars-desktop' },
        draft: true,
        force: true,
      },
    },
  ],
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({ name: 'UI-TARS', setupIcon: 'resources/icon.ico' }),
    // https://github.com/electron/forge/issues/3712
    new MakerDMG({
      overwrite: true,
      background: 'static/dmg-background.png',
      // icon: 'static/dmg-icon.icns',
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
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    // https://github.com/microsoft/playwright/issues/28669#issuecomment-2268380066
    ...(process.env.CI === 'e2e'
      ? []
      : [
          new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
          }),
        ]),
  ],
};

export default config;
