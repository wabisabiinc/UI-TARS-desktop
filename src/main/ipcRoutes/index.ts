/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { initIpc, createServer } from '@ui-tars/electron-ipc/main';
import { screenRoute } from './screen';
import { windowRoute } from './window';
import { permissionRoute } from './permission';
import { agentRoute } from './agent';

const t = initIpc.create();

export const ipcRoutes = t.router({
  ...screenRoute,
  ...windowRoute,
  ...permissionRoute,
  ...agentRoute,
});
export type Router = typeof ipcRoutes;

export const server = createServer(ipcRoutes);
