import { Camera } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';

export const HumanTextMessage = ({ text }: { text: string }) => {
  return (
    <div className="flex gap-2 mb-4 mt-8 items-center">
      <div className="p-3 rounded-md bg-secondary font-mono">{text}</div>
    </div>
  );
};

interface ScreenshotMessageProps {
  onClick?: () => void;
}

export const ScreenshotMessage = ({ onClick }: ScreenshotMessageProps) => {
  return (
    <Button variant="outline" className="rounded-full" onClick={onClick}>
      <Camera className="w-4 h-4" />
      <span>Screenshot</span>
    </Button>
  );
};
