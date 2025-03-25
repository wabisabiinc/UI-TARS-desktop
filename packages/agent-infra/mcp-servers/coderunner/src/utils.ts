/**
 * The following code is modified based on
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/src/server.ts
 *
 * MIT License
 * Copyright (c) 2025 Jun Han
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/LICENSE
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { languageIdToFileExtensionMap } from './constants.js';
import { exec } from 'child_process';

const tmpFiles: string[] = [];
export async function createTmpFile(content: string, languageId: string) {
  const tmpDir = os.tmpdir();
  const fileExtension = getFileExtension(languageId);
  const fileName = `tmp.${fileExtension}`;
  const filePath = path.join(tmpDir, fileName);

  await fs.promises.writeFile(filePath, content);
  tmpFiles.push(filePath);
  console.debug(`Temporary file created at: ${filePath}`);

  return filePath;
}

export async function deleteTmpFiles() {
  for (const filePath of tmpFiles) {
    try {
      await fs.promises.unlink(filePath);
      console.debug(`Temporary file deleted: ${filePath}`);
      tmpFiles.splice(tmpFiles.indexOf(filePath), 1);
    } catch (error) {
      console.error(`Error deleting temporary file: ${filePath}`, error);
    }
  }
  console.debug(`Deleted ${tmpFiles.length} temporary files`);
}

export function getFileExtension(languageId: string): string {
  const fileExtension =
    languageIdToFileExtensionMap[
      languageId as keyof typeof languageIdToFileExtensionMap
    ];
  return fileExtension ?? languageId;
}

export async function executeCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.debug(`Executing command: ${command}`);
    exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(`Error: ${error.message}`);
      }
      if (stderr) {
        reject(`Stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
}
