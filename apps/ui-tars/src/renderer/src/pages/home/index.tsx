/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import ChatInput from '@renderer/components/ChatInput';
import RunMessages from '@renderer/components/RunMessages';
import { useStore } from '@renderer/hooks/useStore';

import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import { SidebarInset, SidebarProvider } from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';

export default function Page() {
  const { messages, thinking, errorMsg } = useStore();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <DragArea />
          <div className="flex-1 min-h-0 flex">
            <RunMessages
              autoScroll
              messages={messages}
              thinking={thinking}
              errorMsg={errorMsg}
            />
          </div>
          <ChatInput />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
