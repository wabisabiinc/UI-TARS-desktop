/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, type ComponentProps } from 'react';
import { Smartphone, Monitor, Gamepad2 } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';

// import { NavMain } from './nav-main';
import { NavHistory } from './nav-history';
import { NavSettings } from './nav-footer';
import { UITarsHeader } from './nav-header';

import { api } from '@renderer/api';

// This is sample data.
const data = {
  navMain: [
    {
      title: 'Playground',
      url: '#',
      icon: Smartphone,
      isActive: true,
      items: [
        {
          title: 'History',
          url: '#',
        },
        {
          title: 'Starred',
          url: '#',
        },
        {
          title: 'Settings',
          url: '#',
        },
      ],
    },
    {
      title: 'Settings',
      url: '#',
      icon: Smartphone,
      items: [
        {
          title: 'General',
          url: '#',
        },
        {
          title: 'Team',
          url: '#',
        },
        {
          title: 'Billing',
          url: '#',
        },
        {
          title: 'Limits',
          url: '#',
        },
      ],
    },
  ],
  history: [
    {
      name: 'Smartphone',
      icon: Smartphone,
    },
    {
      name: 'Monitor',
      icon: Monitor,
    },
    {
      name: 'Gamepad2',
      icon: Gamepad2,
    },
  ],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const onSettingsClick = useCallback(async () => {
    await api.openSettingsWindow();
  }, []);

  return (
    <Sidebar collapsible="icon" className="select-none" {...props}>
      <DragArea></DragArea>
      <SidebarHeader>
        <UITarsHeader />
      </SidebarHeader>
      <SidebarContent>
        {/* <NavMain items={data.navMain} /> */}
        <NavHistory history={data.history} />
      </SidebarContent>
      <SidebarFooter className="p-0">
        <NavSettings onSettingsClick={onSettingsClick} />
      </SidebarFooter>
    </Sidebar>
  );
}
