import { initIpc, createServer } from '@ui-tars/electron-ipc/main';
import { agentRoute } from './agent';
import { llmRoute } from './llm';
import { actionRoute } from './action';
import { browserRoute } from './browser';
import { fileSystemRoute } from './filesystem';

const t = initIpc.create();

export const ipcRoutes = t.router({
  ...agentRoute,
  ...llmRoute,
  ...actionRoute,
  ...browserRoute,
  ...fileSystemRoute,
});
export type Router = typeof ipcRoutes;

export const server = createServer(ipcRoutes);
