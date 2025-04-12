import { isWindows } from '@renderer/utils/os';

export const DragArea = () => {
  if (isWindows) {
    return null;
  }

  return <div className={'w-full pt-7 draggable-area'} />;
};
