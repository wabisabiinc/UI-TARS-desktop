import { initIpc } from '@ui-tars/electron-ipc/main';
import { analyzeImage } from '../customTools/analyzeImage';

const t = initIpc.create();

export const toolsRoute = t.router({
  analyzeImage: t.procedure.input(t.string()).mutation(async ({ input }) => {
    // inputは画像ファイルパス
    return await analyzeImage(input);
  }),
});
