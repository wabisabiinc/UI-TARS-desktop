// /components/Header.tsx
import { Button } from '@renderer/components/ui/button';
import { ChevronLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router';

interface HeaderProps {
  title: string;
  docUrl?: string;
  children?: React.ReactNode;
}

export function NavHeader({ title, docUrl, children }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="pl-4 pr-5 py-3 flex items-center gap-2 draggable-area">
      <Button
        variant="ghost"
        size="sm"
        className="!pl-0"
        style={{ '-webkit-app-region': 'no-drag' }}
        onClick={() => navigate('/')}
      >
        <ChevronLeft strokeWidth={2} className="!h-5 !w-5" />
        <span className="font-semibold">{title}</span>
      </Button>

      <div className="flex-1 flex justify-end gap-2">{children}</div>

      {!!docUrl && (
        <Button
          variant="outline"
          className="size-8"
          size="sm"
          style={{ '-webkit-app-region': 'no-drag' }}
          onClick={() => window.open(docUrl, '_blank')}
        >
          <FileText strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}
