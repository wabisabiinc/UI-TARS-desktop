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
  Text,
  Tooltip,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { Field, Form, Formik } from 'formik';
import { useLayoutEffect, useState } from 'react';
import { IoAdd, IoInformationCircle, IoTrash } from 'react-icons/io5';
import { useDispatch } from 'zutron';

import { VlmProvider } from '@main/store/types';

import { useStore } from '@renderer/hooks/useStore';
import { isWindows } from '@renderer/utils/os';

import { PresetImport } from './PresetImport';

export default function Settings() {
  const { settings, thinking } = useStore();
  console.log('settings', settings);

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
      // onCloseComplete: () => {
      //   dispatch({
      //     type: 'CLOSE_SETTINGS_WINDOW',
      //     payload: null,
      //   });
      // },
    });
  };

  const handleCancel = () => {
    dispatch({
      type: 'CLOSE_SETTINGS_WINDOW',
      payload: null,
    });
  };

  console.log('initialValues', settings);
  const handleUpdatePreset = async () => {
    try {
      await window.electron.setting.updatePresetFromRemote();
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

  const handleClearSettings = async () => {
    try {
      await window.electron.setting.clear();
      // 刷新设置
      dispatch({
        type: 'GET_SETTINGS',
        payload: null,
      });
      toast({
        title: 'All settings cleared successfully',
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: 'Failed to clear settings',
        description: error.message,
        status: 'error',
        duration: 3000,
      });
    }
  };

  return (
    <Box h="100vh" overflow="hidden" px={6} pt={6} pb={0}>
      <Tabs display="flex" flexDirection="column" h="full" pt={4}>
        <Box
          borderColor="gray.200"
          bg="white"
          position="sticky"
          top={0}
          zIndex={1}
          px={2}
          flexShrink={0}
        >
          <TabList>
            <Tab>General</Tab>
            <Box ml="auto" display="flex" alignItems="center">
              <IconButton
                icon={<IoAdd />}
                aria-label="Import Preset"
                variant="ghost"
                onClick={() => setPresetModalOpen(true)}
              />
            </Box>
          </TabList>
        </Box>

        <TabPanels flex="1" overflow="hidden">
          <TabPanel h="full" position="relative" overflow="hidden" p={0}>
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              overflowY="auto"
              px={2}
              sx={{
                '&::-webkit-scrollbar': {
                  width: '10px',
                  backgroundColor: 'transparent',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '2px solid transparent',
                  borderRadius: '10px',
                  backgroundClip: 'padding-box',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  },
                },
                // 只在滚动时显示滚动条
                '&::-webkit-scrollbar-thumb:window-inactive': {
                  backgroundColor: 'transparent',
                },
              }}
            >
              <VStack spacing={2} align="stretch" py={4}>
                {settings?.presetSource?.type === 'remote' && (
                  <Box
                    p={4}
                    bg="gray.50"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="gray.200"
                    mb={4}
                  >
                    <VStack spacing={3} align="stretch">
                      <HStack spacing={3} justify="space-between">
                        <HStack>
                          <Text fontWeight="medium" color="gray.700">
                            Remote Preset Management
                          </Text>
                          <Tooltip label="When using remote preset, settings will be read-only">
                            <Box display="inline-block">
                              <IoInformationCircle color="gray.500" />
                            </Box>
                          </Tooltip>
                        </HStack>
                        <Button
                          colorScheme="blue"
                          size="sm"
                          variant="outline"
                          onClick={handleUpdatePreset}
                        >
                          Update Preset
                        </Button>
                      </HStack>

                      <Box>
                        <Text fontSize="sm" color="gray.600" noOfLines={2}>
                          {settings.presetSource.url}
                        </Text>
                        {settings.presetSource.lastUpdated && (
                          <Text fontSize="xs" color="gray.500" mt={1}>
                            Last updated:{' '}
                            {new Date(
                              settings.presetSource.lastUpdated,
                            ).toLocaleString()}
                          </Text>
                        )}
                      </Box>

                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="red"
                        onClick={async () => {
                          await window.electron.setting.resetPreset();
                          // refresh setting
                          dispatch({
                            type: 'GET_SETTINGS',
                            payload: null,
                          });
                          toast({
                            title: 'Reset to manual mode successfully',
                            status: 'success',
                            duration: 2000,
                          });
                        }}
                        alignSelf="flex-start"
                      >
                        Reset to Manual
                      </Button>
                    </VStack>
                  </Box>
                )}

                {settings ? (
                  <Formik
                    initialValues={settings}
                    onSubmit={handleSubmit}
                    enableReinitialize
                  >
                    {({ values = {}, setFieldValue }) => {
                      const isRemotePreset =
                        settings?.presetSource?.type === 'remote';
                      const inputProps = {
                        bg: 'white',
                        borderColor: 'gray.200',
                        _hover: isRemotePreset
                          ? {}
                          : { borderColor: 'gray.300' },
                        _focus: isRemotePreset
                          ? {}
                          : {
                              borderColor: 'gray.400',
                              boxShadow: 'none',
                            },
                        isReadOnly: isRemotePreset,
                        opacity: isRemotePreset ? 0.7 : 1,
                        cursor: isRemotePreset ? 'not-allowed' : 'pointer',
                      };

                      return (
                        <Form id="settings-form">
                          <VStack spacing={4} align="stretch">
                            <FormControl>
                              <FormLabel color="gray.700">Language</FormLabel>
                              <Field
                                as={Select}
                                name="language"
                                value={values.language}
                                {...inputProps}
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
                              <FormLabel color="gray.700">
                                VLM Provider
                              </FormLabel>
                              <Field
                                as={Select}
                                name="vlmProvider"
                                value={values.vlmProvider}
                                {...inputProps}
                                onChange={(e) => {
                                  if (isRemotePreset) return;
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
                                      setFieldValue(
                                        'vlmApiKey',
                                        'your_api_key',
                                      );
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
                              <FormLabel color="gray.700">
                                VLM Base URL
                              </FormLabel>
                              <Field
                                as={Input}
                                name="vlmBaseUrl"
                                value={values.vlmBaseUrl}
                                placeholder="please input VLM Base URL"
                                {...inputProps}
                              />
                            </FormControl>

                            <FormControl>
                              <FormLabel color="gray.700">
                                VLM API Key
                              </FormLabel>
                              <Field
                                as={Input}
                                name="vlmApiKey"
                                value={values.vlmApiKey}
                                placeholder="please input VLM API_Key"
                                {...inputProps}
                              />
                            </FormControl>

                            <FormControl>
                              <FormLabel color="gray.700">
                                VLM Model Name
                              </FormLabel>
                              <Field
                                as={Input}
                                name="vlmModelName"
                                value={values.vlmModelName}
                                placeholder="please input VLM Model Name"
                                {...inputProps}
                              />
                            </FormControl>

                            <FormControl>
                              <FormLabel color="gray.700">
                                Report Storage Base URL
                              </FormLabel>
                              <Field
                                as={Input}
                                name="reportStorageBaseUrl"
                                value={values.reportStorageBaseUrl}
                                placeholder="https://your-report-storage-endpoint.com/upload"
                                {...inputProps}
                              />
                            </FormControl>

                            <FormControl>
                              <FormLabel color="gray.700">
                                UTIO Base URL
                              </FormLabel>
                              <Field
                                as={Input}
                                name="utioBaseUrl"
                                value={values.utioBaseUrl}
                                placeholder="https://your-utio-endpoint.com/collect"
                                {...inputProps}
                              />
                            </FormControl>
                          </VStack>
                        </Form>
                      );
                    }}
                  </Formik>
                ) : (
                  <Center>
                    <Spinner color="color.primary" />
                  </Center>
                )}
              </VStack>
            </Box>
          </TabPanel>
        </TabPanels>

        <Box
          px={2}
          py={4}
          borderTop="1px"
          borderColor="gray.200"
          bg="white"
          position="sticky"
          bottom={0}
          zIndex={1}
          flexShrink={0}
        >
          <HStack spacing={4} justify="space-between">
            <HStack spacing={4}>
              <Button
                form="settings-form"
                as="button"
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

            <IconButton
              aria-label="Clear all settings"
              icon={<IoTrash />}
              variant="ghost"
              colorScheme="red"
              onClick={handleClearSettings}
            />
          </HStack>
        </Box>
      </Tabs>

      <PresetImport
        isOpen={isPresetModalOpen}
        onClose={() => setPresetModalOpen(false)}
      />
    </Box>
  );
}

export { Settings as Component };
