/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Box,
  Button,
  Center,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Select,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { Field, Form, Formik } from 'formik';
import { useLayoutEffect, useState } from 'react';
import { IoAdd } from 'react-icons/io5';
import { useDispatch } from 'zutron';

import { VlmProvider } from '@main/store/types';

import { useStore } from '@renderer/hooks/useStore';
import { isWindows } from '@renderer/utils/os';

import PresetImport from './PresetImport';

const Settings = () => {
  const { settings, thinking } = useStore();
  const [isPresetModalOpen, setPresetModalOpen] = useState(false);
  const toast = useToast();
  const dispatch = useDispatch(window.zutron);

  useLayoutEffect(() => {
    console.log('get_settings');
    dispatch({
      type: 'GET_SETTINGS',
      payload: null,
    });
  }, []);

  console.log('settings', settings, 'thinking', thinking);

  const handleSubmit = async (values) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: values,
    });

    toast({
      title: 'Settings saved successfully',
      position: 'top',
      status: 'success',
      duration: 1500,
      isClosable: true,
      variant: 'ui-tars-success',
      onCloseComplete: () => {
        dispatch({
          type: 'CLOSE_SETTINGS_WINDOW',
          payload: null,
        });
      },
    });
  };

  const handleCancel = () => {
    dispatch({
      type: 'CLOSE_SETTINGS_WINDOW',
      payload: null,
    });
  };

  const handleUpdatePreset = async () => {
    try {
      await dispatch('UPDATE_PRESET_FROM_REMOTE');
      toast({
        title: 'Preset updated successfully',
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: 'Failed to update preset',
        description: error.message,
        status: 'error',
        duration: 3000,
      });
    }
  };

  const isPresetEnabled = !!settings?.presetSource;

  return (
    <Box px={4} py={!isWindows ? 8 : 0} position="relative" overflow="hidden">
      {!isWindows && (
        <Box
          className="draggable-area"
          w="100%"
          h={34}
          position="absolute"
          top={0}
        />
      )}
      <Tabs variant="line">
        <TabList>
          <Tab>General</Tab>
          <Box ml="auto" display="flex" alignItems="center">
            {settings?.presetSource?.type === 'remote' && (
              <Button
                size="sm"
                mr={2}
                onClick={handleUpdatePreset}
                variant="tars-ghost"
              >
                Update Preset
              </Button>
            )}
            <IconButton
              icon={<IoAdd />}
              aria-label="Import Preset"
              variant="ghost"
              onClick={() => setPresetModalOpen(true)}
            />
          </Box>
        </TabList>

        <TabPanels>
          <TabPanel>
            <VStack spacing={8} align="stretch">
              {settings?.presetSource && (
                <Box p={4} bg="gray.50" borderRadius="md">
                  <Text fontSize="sm" color="gray.600">
                    Settings managed by {settings.presetSource.type} preset
                    {settings.presetSource.url &&
                      ` from ${settings.presetSource.url}`}
                    {settings.presetSource.lastUpdated &&
                      ` (Last updated: ${new Date(settings.presetSource.lastUpdated).toLocaleString()})`}
                  </Text>
                  <Button
                    size="sm"
                    mt={2}
                    onClick={() => dispatch('RESET_PRESET')}
                    variant="ghost"
                  >
                    Reset to Manual
                  </Button>
                </Box>
              )}

              {settings ? (
                <Formik initialValues={settings} onSubmit={handleSubmit}>
                  {({ values = {}, setFieldValue }) => (
                    <Form>
                      <VStack spacing={4} align="stretch">
                        <FormControl>
                          <FormLabel color="gray.700">Language</FormLabel>
                          <Field
                            as={Select}
                            name="language"
                            value={values.language}
                            bg="white"
                            borderColor="gray.200"
                            _hover={{ borderColor: 'gray.300' }}
                            _focus={{
                              borderColor: 'gray.400',
                              boxShadow: 'none',
                            }}
                          >
                            <option key="en" value="en">
                              English
                            </option>
                            <option key="zh" value="zh">
                              中文
                            </option>
                          </Field>
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM Provider</FormLabel>
                          <Field
                            as={Select}
                            name="vlmProvider"
                            value={values.vlmProvider}
                            bg="white"
                            borderColor="gray.200"
                            _hover={{ borderColor: 'gray.300' }}
                            _focus={{
                              borderColor: 'gray.400',
                              boxShadow: 'none',
                            }}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setFieldValue('vlmProvider', newValue);

                              if (!settings.vlmBaseUrl) {
                                setFieldValue('vlmProvider', newValue);
                                if (newValue === VlmProvider.vLLM) {
                                  setFieldValue(
                                    'vlmBaseUrl',
                                    'http://localhost:8000/v1',
                                  );
                                  setFieldValue('vlmModelName', 'ui-tars');
                                } else if (
                                  newValue === VlmProvider.Huggingface
                                ) {
                                  setFieldValue(
                                    'vlmBaseUrl',
                                    'https://<your_service>.us-east-1.aws.endpoints.huggingface.cloud/v1',
                                  );
                                  setFieldValue('vlmApiKey', 'your_api_key');
                                  setFieldValue(
                                    'vlmModelName',
                                    'your_model_name',
                                  );
                                }
                              }
                            }}
                          >
                            {Object.values(VlmProvider).map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Field>
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM Base URL</FormLabel>
                          <Field
                            as={Input}
                            name="vlmBaseUrl"
                            value={values.vlmBaseUrl}
                            placeholder="please input VLM Base URL"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM API Key</FormLabel>
                          <Field
                            as={Input}
                            name="vlmApiKey"
                            value={values.vlmApiKey}
                            placeholder="please input VLM API_Key"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM Model Name</FormLabel>
                          <Field
                            as={Input}
                            name="vlmModelName"
                            value={values.vlmModelName}
                            placeholder="please input VLM Model Name"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">
                            Report Storage Endpoint
                          </FormLabel>
                          <Field
                            as={Input}
                            name="reportStorageEndpoint"
                            value={values.reportStorageEndpoint}
                            placeholder="https://your-report-storage-endpoint.com/upload"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">UTIO Endpoint</FormLabel>
                          <Field
                            as={Input}
                            name="utioEndpoint"
                            value={values.utioEndpoint}
                            placeholder="https://your-utio-endpoint.com/collect"
                          />
                        </FormControl>

                        <HStack spacing={4}>
                          <Button
                            type="submit"
                            rounded="base"
                            variant="tars-ghost"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={handleCancel}
                            rounded="base"
                            variant="ghost"
                            fontWeight="normal"
                          >
                            Cancel
                          </Button>
                        </HStack>
                      </VStack>
                    </Form>
                  )}
                </Formik>
              ) : (
                <Center>
                  <Spinner color="color.primary" />
                </Center>
              )}
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
      <PresetImport
        isOpen={isPresetModalOpen}
        onClose={() => setPresetModalOpen(false)}
      />
    </Box>
  );
};

export default Settings;

export { Settings as Component };
