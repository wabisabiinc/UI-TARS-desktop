/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChakraProvider } from '@chakra-ui/react';
import { Route, HashRouter as Router, Routes } from 'react-router';
import { lazy, Suspense } from 'react';

import './styles/globals.css';
// import { chakraUItheme } from './theme';

const Home = lazy(() => import('./pages/home'));
const Settings = lazy(() => import('./pages/settings'));
const Launcher = lazy(() => import('./pages/launcher'));
const InProgressing = lazy(() => import('./pages/inProgressing'));

export default function App() {
  return (
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
          <Route path="/settings" element={<Settings />} />
          <Route path="/launcher" element={<Launcher />} />
          <Route path="/in-progressing" element={<InProgressing />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
