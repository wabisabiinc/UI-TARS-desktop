/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Route, HashRouter as Router, Routes } from 'react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';

import './styles/globals.css';

const Home = lazy(() => import('./pages/home'));
const Settings = lazy(() => import('./pages/settings'));
const Settings2 = lazy(() => import('./pages/settings/Settings'));
const Launcher = lazy(() => import('./pages/launcher'));
const InProgressing = lazy(() => import('./pages/inProgressing'));

export default function App() {
  return (
    // <ChakraProvider theme={chakraUItheme}>
    <Router>
      <Suspense
        fallback={
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings2 />} />
          <Route path="/launcher" element={<Launcher />} />
          <Route path="/in-progressing" element={<InProgressing />} />
        </Routes>
        <Toaster
          position="top-right"
          offset={{ top: '48px' }}
          mobileOffset={{ top: '48px' }}
        />
      </Suspense>
    </Router>
    // </ChakraProvider>
  );
}
