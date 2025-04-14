import { Loader2 } from 'lucide-react';

interface LoadingTextProps {
  children: React.ReactNode;
}

export default function LoadingText({ children }: LoadingTextProps) {
  return (
    <div className="mt-4">
      <div className="inline-flex items-center gap-2 text-muted-foreground animate-pulse">
        <Loader2 className="h-4 w-4 animate-spin" />
        {children}
      </div>
    </div>
  );
}
