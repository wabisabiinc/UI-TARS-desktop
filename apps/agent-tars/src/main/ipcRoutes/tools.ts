import { initIpc } from '@ui-tars/electron-ipc/main';
import { analyzeImage } from '../customTools/analyzeImage';

const t = initIpc.create();

export const toolsRoute = t.router({
  analyzeImage: t.procedure
    .input<{ path: string }>() // path: string型で受け取る
    .handle(async ({ input }) => {
      if (!input?.path) {
        throw new Error('path is required');
      }
      return await analyzeImage(input.path);
    }),
});
