import { isWindows } from '@renderer/utils/os';

export const DragArea = () => {
  if (isWindows) {
    return null;
  }

  return <div className={'w-full h-7 draggable-area'} />;
};
