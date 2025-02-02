/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useDispatch } from 'zutron';

interface PresetImportProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PresetImport({ isOpen, onClose }: PresetImportProps) {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const dispatch = useDispatch(window.zutron);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Use FileReader to read file contents
      const reader = new FileReader();
      const yamlText = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      // Send text content via IPC
      await window.electron.setting.importPresetFromFile(yamlText);
      dispatch({ type: 'GET_SETTINGS', payload: null });

      toast({
        title: 'Preset imported successfully',
        status: 'success',
        duration: 2000,
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to import preset',
        description: error.message,
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleRemoteImport = async () => {
    try {
      await window.electron.setting.importPresetFromUrl(remoteUrl, autoUpdate);
      dispatch({ type: 'GET_SETTINGS', payload: null });

      toast({
        title: 'Preset imported successfully',
        status: 'success',
        duration: 2000,
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to import preset',
        description: error.message,
        status: 'error',
        duration: 3000,
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Import Preset</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Tabs>
            <TabList>
              <Tab>Local File</Tab>
              <Tab>Remote URL</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <VStack spacing={4}>
                  <Text>Select a YAML file to import settings preset</Text>
                  <input
                    type="file"
                    accept=".yaml,.yml"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <Button onClick={() => fileInputRef.current?.click()}>
                    Choose File
                  </Button>
                </VStack>
              </TabPanel>
              <TabPanel>
                <VStack spacing={4}>
                  <FormControl>
                    <FormLabel>Preset URL</FormLabel>
                    <Input
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      placeholder="https://example.com/preset.yaml"
                    />
                  </FormControl>
                  <FormControl display="flex" alignItems="center">
                    <FormLabel mb="0">Auto update on startup</FormLabel>
                    <Switch
                      isChecked={autoUpdate}
                      onChange={(e) => setAutoUpdate(e.target.checked)}
                    />
                  </FormControl>
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="tars-ghost"
            onClick={handleRemoteImport}
            isDisabled={!remoteUrl}
          >
            Import
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
