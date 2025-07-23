import { initIpc, createServer } from '@ui-tars/electron-ipc/main';

import { agentRoute } from './agent';
import { llmRoute } from './llm';
import { actionRoute } from './action';
import { browserRoute } from './browser';
// ❗ renderer ビルドに巻き込まれやすいので “再エクスポートだけ” しない。
// ただし main 側では使うのでここで展開はOK
import { fileSystemRoute } from './filesystem';
import { searchRoute } from './search';
import { settingsRoute } from './settings';
import { mcpRoute } from './mcp';
import { toolsRoute } from './tools';

const t = initIpc.create();

export const ipcRoutes = t.router({
  ...toolsRoute,
  ...agentRoute,
  ...llmRoute,
  ...actionRoute,
  ...browserRoute,
  ...fileSystemRoute,
  ...searchRoute,
  ...settingsRoute,
  ...mcpRoute,
});

export type Router = typeof ipcRoutes;

export const server = createServer(ipcRoutes);
