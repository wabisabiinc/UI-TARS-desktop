// apps/agent-tars/src/renderer/main.tsx

// ① これを先頭に持ってくることで、以降のコードで window.electron や window.api が必ず存在する状態になる
import '@/globals';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.scss';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
