import { initIpc } from '@ui-tars/electron-ipc/main';
import { analyzeImage } from '../customTools/analyzeImage'; // Node側に実装した関数

const t = initIpc.create();

export const toolsRoute = t.router({
  analyzeImage: t.procedure.input('string').query(async ({ input: path }) => {
    // analyzeImageの引数はToolCall型想定ならここでラップ
    return await analyzeImage({
      function: { name: 'analyzeImage', arguments: JSON.stringify({ path }) },
    });
  }),
});
