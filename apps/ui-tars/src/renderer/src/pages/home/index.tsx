/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChevronRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { BROWSER_OPERATOR, COMPUTER_OPERATOR } from '@renderer/const';
import { useNavigate } from 'react-router';
import { Button } from '@renderer/components/ui/button';

const Home = () => {
  const navigate = useNavigate();

  const toRemoteComputer = (value: 'free' | 'paid') => {
    console.log('toRemoteComputer', value);

    if (value === 'free') {
      navigate('/remote/computer', {
        state: {
          isFree: true,
        },
      });

      return;
    }

    navigate('/remote/computer', {
      state: {
        isFree: false,
      },
    });
  };

  const toLocalComputer = () => {
    navigate('/local/computer');
  };

  const toRemoteBrowser = (value: 'free' | 'paid') => {
    console.log('toRemoteBrowser', value);

    if (value === 'free') {
      navigate('/remote/browser');
    }
  };

  const toLocalBrowser = () => {
    navigate('/local/browser');
  };

  const renderRemoteComputerButton = () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="flex-1">Use Remote Computer</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="ml-18">
          <DropdownMenuItem onClick={() => toRemoteComputer('free')}>
            Quick free trial
            <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toRemoteComputer('paid')}>
            Use your own site to experience
            <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderRemoteBrowserButton = () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="flex-1">Use Remote Browser</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="ml-20">
          <DropdownMenuItem onClick={() => toRemoteBrowser('free')}>
            Quick free trial
            <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toRemoteBrowser('paid')}>
            Use your own site to experience
            <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <h1 className="text-2xl font-semibold mt-1 mb-4">
        Welcome to UI-TARS Desktop
      </h1>
      <div className="flex gap-2">
        <Card className="w-[400px] py-5">
          <CardHeader className="px-5">
            <CardTitle>{COMPUTER_OPERATOR}</CardTitle>
            <CardDescription>
              Let UI-TARS-Desktop take control of your computer for GUI
              automation
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <div className="w-26 h-30"></div>
          </CardContent>
          <CardFooter className="gap-3 px-5 flex justify-between">
            {renderRemoteComputerButton()}
            <Button
              onClick={toLocalComputer}
              variant="secondary"
              className="flex-1"
            >
              Use Local Computer
            </Button>
          </CardFooter>
        </Card>
        <Card className="w-[400px] py-5">
          <CardHeader className="px-5">
            <CardTitle>{BROWSER_OPERATOR}</CardTitle>
            <CardDescription>
              Run a background browser to perform GUI tasks without interrupting
              users
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <div className="w-26 h-30"></div>
          </CardContent>
          <CardFooter className="gap-3 px-5 flex justify-between">
            {renderRemoteBrowserButton()}
            <Button
              onClick={toLocalBrowser}
              variant="secondary"
              className="flex-1"
            >
              Use Local Browser
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Home;
