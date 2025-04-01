import { ToolCallType } from '@main/agent/agent-type';

export const SNAPSHOT_BROWSER_ACTIONS = [
  ToolCallType.BrowserHover,
  ToolCallType.BrowserNewTab,
  ToolCallType.BrowserNavigate,
  ToolCallType.BrowserSelect,
  ToolCallType.BrowserClick,
  ToolCallType.BrowserFormInputFill,
  ToolCallType.BrowserSwitchTab,
  ToolCallType.BrowserScroll,
];
