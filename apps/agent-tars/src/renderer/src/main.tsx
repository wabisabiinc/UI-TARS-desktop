// apps/agent-tars/src/renderer/main.tsx

// ① これを先頭に持ってくることで、以降のコードで window.electron や window.api が必ず存在する状態になる
import '@/globals';

// ② IPC stub or 本物を選択するスタブ実装を強制的に読み込む
import './api';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Provider as JotaiProvider } from 'jotai';
import './index.scss';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);
root.render(
  <React.StrictMode>
    <JotaiProvider>
      {' '}
      {/* ←★AppをJotaiのProviderでラップ */}
      <App />
    </JotaiProvider>
  </React.StrictMode>,
);
