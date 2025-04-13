/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, ChakraProvider, Flex } from '@chakra-ui/react';

import ChatInput from '@renderer/components/ChatInput';
import Header from '@renderer/components/Header';
import RunMessages from '@renderer/components/RunMessages';
import { useStore } from '@renderer/hooks/useStore';
import { isWindows } from '@renderer/utils/os';

import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';
import { chakraUItheme } from '../../theme';

export default function Page() {
  const { messages, thinking, errorMsg } = useStore();

  return (
    <div>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DragArea></DragArea>
          {/* <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
            </div>
          </header> */}
          <ChakraProvider theme={chakraUItheme}>
            <Flex h="90vh">
              <Box
                minW={400}
                w="full"
                h="full"
                borderRight="1px"
                borderColor="gray.200"
                bg="background.primary"
              >
                <Flex direction="column" h="full">
                  <RunMessages
                    autoScroll
                    messages={messages}
                    thinking={thinking}
                    errorMsg={errorMsg}
                  />
                  <ChatInput />
                </Flex>
              </Box>
            </Flex>
          </ChakraProvider>
          <ChatInput />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

export function Home() {
  const { messages, thinking, errorMsg } = useStore();

  return (
    <Flex h="100vh">
      <Box
        minW={400}
        w="full"
        h="full"
        borderRight="1px"
        borderColor="gray.200"
        bg="background.primary"
      >
        <Flex direction="column" h="full">
          {!isWindows && <Box className="draggable-area" w="100%" pt={5} />}
          <Header />
          <RunMessages
            autoScroll
            messages={messages}
            thinking={thinking}
            errorMsg={errorMsg}
          />
          <ChatInput />
        </Flex>
      </Box>
    </Flex>
  );
}
