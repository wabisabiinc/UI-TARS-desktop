/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import ChatInput from '@renderer/components/ChatInput';
import RunMessages from '@renderer/components/RunMessages';
import { useStore } from '@renderer/hooks/useStore';

import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';
import { ShareOptions } from '@renderer/components/ChatInput/ShareOptions';

export default function Page() {
  const { messages, thinking, errorMsg } = useStore();

  return (
    <SidebarProvider className="flex h-screen w-full">
      <AppSidebar />
      <SidebarInset className="flex-1">
        <DragArea />
        <div className="flex w-full items-center mb-1">
          <SidebarTrigger className="ml-2" />
          <ShareOptions />
        </div>
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
    </SidebarProvider>
  );
}
