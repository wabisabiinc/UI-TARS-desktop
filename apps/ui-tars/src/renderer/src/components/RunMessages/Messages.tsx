import { Camera } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';

export const HumanTextMessage = ({ text }: { text: string }) => {
  return (
    <div className="flex gap-2 mb-4 items-center justify-end">
      <div className="p-3 rounded-md bg-secondary font-mono">{text}</div>
    </div>
  );
};

interface ScreenshotMessageProps {
  onClick?: () => void;
}

export const ScreenshotMessage = ({ onClick }: ScreenshotMessageProps) => {
  return (
    <Button
      variant="secondary"
      className="flex items-center gap-2 p-3 rounded-full bg-secondary/90 hover:bg-secondary text-secondary-foreground transition-colors"
      onClick={onClick}
    >
      <Camera className="w-4 h-4" />
      <span>Screenshot</span>
    </Button>
  );
};
