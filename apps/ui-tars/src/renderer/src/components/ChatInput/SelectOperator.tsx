/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button } from '@renderer/components/ui/button';
import { ChevronDown, Globe, Monitor, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { useSetting } from '@renderer/hooks/useSetting';
import { useState } from 'react';
import { BROWSER_USE, COMPUTERR_USE } from '@renderer/const';

type Operator = 'nutjs' | 'browser';

const getOperatorIcon = (type: string) => {
  switch (type) {
    case 'nutjs':
      return <Monitor className="h-4 w-4 mr-2" />;
    case 'browser':
      return <Globe className="h-4 w-4 mr-2" />;
    default:
      return <Monitor className="h-4 w-4 mr-2" />;
  }
};

const getOperatorLabel = (type: string) => {
  switch (type) {
    case 'nutjs':
      return COMPUTERR_USE;
    case 'browser':
      return BROWSER_USE;
    default:
      return COMPUTERR_USE;
  }
};

export const SelectOperator = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { settings, updateSetting } = useSetting();

  // console.log('settings', settings);

  const currentOperator = settings.operator || 'nutjs';

  const handleSelect = (type: Operator) => {
    updateSetting({
      ...settings,
      operator: type,
    });
    console.log('handleSelect', type);
  };

  return (
    <div className="absolute left-4 bottom-4">
      <DropdownMenu onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            {getOperatorIcon(currentOperator)}
            {getOperatorLabel(currentOperator)}
            <ChevronDown
              className={`h-4 w-4 ml-2 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => handleSelect('nutjs')}>
            <Monitor className="h-4 w-4 mr-2" />
            Computer Use
            {currentOperator === 'nutjs' && <Check className="h-4 w-4 ml-2" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSelect('browser')}>
            <Globe className="h-4 w-4 mr-2" />
            Browser Use
            {currentOperator === 'browser' && (
              <Check className="h-4 w-4 ml-2" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
