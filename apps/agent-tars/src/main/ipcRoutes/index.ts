import { initIpc, createServer } from '@ui-tars/electron-ipc/main';
import { agentRoute } from './agent';
import { llmRoute } from './llm';
import { actionRoute } from './action';
import { browserRoute } from './browser';
import { fileSystemRoute } from './filesystem';
import { searchRoute } from './search';
import { settingsRoute } from './settings';
import { mcpRoute } from './mcp';
import { toolsRoute } from './tools'; // ←これを追加

const t = initIpc.create();

export const ipcRoutes = t.router({
  ...toolsRoute, // ←この行を必ず最上段 or 適切な位置に追加
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
