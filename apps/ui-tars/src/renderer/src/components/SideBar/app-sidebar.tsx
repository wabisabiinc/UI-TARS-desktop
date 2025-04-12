/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as React from 'react';
import { Smartphone, History, Monitor, Gamepad2 } from 'lucide-react';

import { NavMain } from '@/renderer/src/components/SideBar/nav-main';
import { NavHistory } from '@/renderer/src/components/SideBar/nav-history';
import { NavUser } from '@/renderer/src/components/SideBar/nav-user';
import { UITarsHeader } from '@/renderer/src/components/SideBar/nav-header';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@renderer/components/ui/sidebar';
import { DragArea } from '@renderer/components/Common/drag';

// This is sample data.
const data = {
  user: {
    name: 'shadcn',
    email: 'm@example.com',
    avatar: '/avatars/shadcn.jpg',
  },
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <DragArea></DragArea>
      <SidebarHeader>
        <UITarsHeader />
      </SidebarHeader>
      <SidebarContent>
        {/* <NavMain items={data.navMain} /> */}
        <NavHistory history={data.history} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
