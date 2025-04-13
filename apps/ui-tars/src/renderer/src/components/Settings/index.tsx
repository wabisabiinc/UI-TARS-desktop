/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { cn } from '@renderer/utils';
import { Label } from '@renderer/components/ui/label';
import { Input } from '@renderer/components/ui/input';

interface Section {
  id: string;
  title: string;
}

const sections: Section[] = [
  { id: 'basic', title: '基础设置' },
  { id: 'capabilities', title: '部署能力' },
  { id: 'source', title: '部署设置来源' },
  { id: 'scm', title: 'SCM 设置' },
];

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [activeSection, setActiveSection] = useState('basic');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5 },
    );

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.querySelectorAll('section[id]').forEach((section) => {
        observer.observe(section);
      });
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-screen">
      {/* 左侧导航 */}
      <div className="w-64 border-r p-4 space-y-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={cn(
              'block px-4 py-2 rounded-md transition-colors',
              activeSection === section.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted',
            )}
          >
            {section.title}
          </a>
        ))}
      </div>

      {/* 右侧内容区 */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <SettingsLayout>
      <section id="basic" className="mb-10">
        <Card>
          <CardHeader>
            <CardTitle>基础设置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="flow-name">流量名称</Label>
                <Input id="flow-name" placeholder="全流量" />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="capabilities" className="mb-10">
        <Card>
          <CardHeader>
            <CardTitle>部署能力</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Node</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input value="Node.js 18" readOnly />
                  <Input value="stone.aico.rag" readOnly />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 其他部分的内容可以按照类似的方式添加 */}
      <section id="source" className="mb-10">
        <Card>
          <CardHeader>
            <CardTitle>部署设置来源</CardTitle>
          </CardHeader>
          <CardContent>{/* 部署设置来源的具体内容 */}</CardContent>
        </Card>
      </section>

      <section id="scm" className="mb-10">
        <Card>
          <CardHeader>
            <CardTitle>SCM 设置</CardTitle>
          </CardHeader>
          <CardContent>{/* SCM 设置的具体内容 */}</CardContent>
        </Card>
      </section>
    </SettingsLayout>
  );
}
