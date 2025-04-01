import { ToolCallType } from '@main/agent/agent-type';

export interface BrowserPanelProps {
  tool: string;
  params: any;
  result?: any;
}

export interface ContentProps {
  tool: ToolCallType;
  params: any;
  result?: any;
}
