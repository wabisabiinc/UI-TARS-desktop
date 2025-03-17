import { MCPClient } from '@agent-infra/mcp-client';
import { MCPServerName } from '@agent-infra/shared';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

// Keep track of the filesystem client to allow updating allowed directories
let fsClientModule: any = null;

export const getOmegaDir = async () => {
  // Create working directory in user's home directory.
  const omegaDir = path.join(os.homedir(), '.omega');
  if (!fs.existsSync(omegaDir)) {
    await fs.mkdir(omegaDir, { recursive: true });
  }
  return omegaDir;
};

const dynamicImport = (url) =>
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(`return import('${url}')`)();

// Initialize MCP client with filesystem and commands tools
export const createMcpClient = async () => {
  if (mapClientRef.current) {
    return mapClientRef.current;
  }
  const { client: commandClient } = await dynamicImport(
    '@agent-infra/mcp-server-commands',
  );
  const fsModule = await dynamicImport('@agent-infra/mcp-server-filesystem');
  const { client: fsClient, setAllowedDirectories } = fsModule;
  fsClientModule = fsModule;

  const { client: browserClient } = await dynamicImport(
    '@agent-infra/mcp-server-browser',
  );

  const omegaDir = await getOmegaDir();
  setAllowedDirectories([omegaDir]);

  const toolsMap = {
    [MCPServerName.FileSystem]: {
      name: MCPServerName.FileSystem,
      description: 'filesystem tool',
      localClient: fsClient,
    },
    [MCPServerName.Commands]: {
      name: MCPServerName.Commands,
      description: 'commands tool',
      localClient: commandClient,
    },
    [MCPServerName.Browser]: {
      name: MCPServerName.Browser,
      local: true,
      description: 'browser tools',
      localClient: browserClient,
    },
  };

  const client = new MCPClient(Object.values(toolsMap));
  mapClientRef.current = client;
  return client;
};

export const mapClientRef: {
  current: MCPClient | undefined;
} = {
  current: undefined,
};

export const setAllowedDirectories = async (directories: string[]) => {
  if (fsClientModule && fsClientModule.setAllowedDirectories) {
    return fsClientModule.setAllowedDirectories(directories);
  }
  throw new Error('File system client not initialized');
};

export const getAllowedDirectories = async (): Promise<string[]> => {
  if (fsClientModule && fsClientModule.getAllowedDirectories) {
    return fsClientModule.getAllowedDirectories();
  }
  const omegaDir = await getOmegaDir();
  return [omegaDir];
};
