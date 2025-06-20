// src/renderer/components/LeftSidebar/Settings/SettingsModal.tsx

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
  Tooltip,
  Link,
} from '@nextui-org/react';
import { useState } from 'react';
import { ModelSettingsTab } from './ModelSettingsTab';
import { FileSystemSettingsTab } from './FileSystemSettingsTab';
import { SearchSettingsTab } from './SearchSettingsTab';
import { MCPServersSettingsTab } from './MCPServersSettingsTab';
import { useAppSettings } from './useAppSettings';
import {
  FiSettings,
  FiBox,
  FiSearch,
  FiFolder,
  FiServer,
  FiHelpCircle,
  FiRefreshCw,
} from 'react-icons/fi';
import styles from './SettingsModal.module.scss';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  // カスタムフックから必要な関数・状態を取得
  const {
    settings,
    setSettings,
    saveSettings,
    validateSettings,
    resetToDefaults,
  } = useAppSettings();

  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [selectedTab, setSelectedTab] = useState<
    'models' | 'search' | 'filesystem' | 'mcp-servers'
  >('models');

  // 「Save」ボタン押下時のハンドラ
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // バリデーション
      const result = validateSettings();
      if (result.hasError) {
        // エラーのあるタブに切り替え
        if (result.errorTab) {
          setSelectedTab(result.errorTab as any);
        }
        return; // 保存処理中断
      }

      // 実際の保存処理
      const ok = await saveSettings();
      if (ok) {
        onClose();
      }
      // saveSettings 内で toast による成功／失敗表示を行う
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // 「Reset to Defaults」ボタン押下時のハンドラ
  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetToDefaults();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      scrollBehavior="outside"
      classNames={{
        base: `${styles.settingsModal} h-[100vh] max-h-[100vh]`,
        body: 'p-0 h-[calc(100vh-10rem)] overflow-hidden',
        backdrop: 'bg-black/50 backdrop-blur-sm',
      }}
    >
      <ModalContent>
        {(onModalClose) => (
          <>
            {/* ヘッダー */}
            <ModalHeader className="border-b border-divider">
              <div className="flex justify-center items-center gap-2 w-full">
                <FiSettings className="text-primary" />
                <span className="text-xl">Settings</span>
              </div>
            </ModalHeader>

            {/* 本体 */}
            <ModalBody>
              <div className="flex h-full">
                {/* 左側タブ */}
                <div className="w-48 border-r border-divider bg-default-50 dark:bg-default-100/5 flex flex-col h-full">
                  <TabButton
                    icon={<FiBox />}
                    label="AI Models"
                    active={selectedTab === 'models'}
                    onClick={() => setSelectedTab('models')}
                  />
                  <TabButton
                    icon={<FiSearch />}
                    label="Search"
                    active={selectedTab === 'search'}
                    onClick={() => setSelectedTab('search')}
                  />
                  <TabButton
                    icon={<FiFolder />}
                    label="File System"
                    active={selectedTab === 'filesystem'}
                    onClick={() => setSelectedTab('filesystem')}
                  />
                  <TabButton
                    icon={<FiServer />}
                    label="MCP Servers"
                    active={selectedTab === 'mcp-servers'}
                    onClick={() => setSelectedTab('mcp-servers')}
                  />
                </div>

                {/* 右側中身 */}
                <div className="flex-1 overflow-auto p-6">
                  {selectedTab === 'models' && (
                    <>
                      <h2 className="text-xl font-semibold mb-4">
                        AI Models Settings
                      </h2>
                      <ModelSettingsTab
                        settings={settings.model}
                        setSettings={(model) =>
                          setSettings({ ...settings, model })
                        }
                      />
                    </>
                  )}
                  {selectedTab === 'search' && (
                    <>
                      <h2 className="text-xl font-semibold mb-4">
                        Search Settings
                      </h2>
                      <SearchSettingsTab
                        settings={settings.search}
                        setSettings={(search) =>
                          setSettings({ ...settings, search })
                        }
                      />
                    </>
                  )}
                  {selectedTab === 'filesystem' && (
                    <>
                      <h2 className="text-xl font-semibold mb-4">
                        File System Settings
                      </h2>
                      <FileSystemSettingsTab
                        settings={settings.fileSystem}
                        setSettings={(fs) =>
                          setSettings({ ...settings, fileSystem: fs })
                        }
                      />
                    </>
                  )}
                  {selectedTab === 'mcp-servers' && (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-xl font-semibold">
                          MCP Servers Settings
                        </h2>
                        <Tooltip content="MCP Servers Help" placement="top">
                          <Link
                            href="https://agent-tars.com/doc/mcp"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FiHelpCircle className="text-gray-400 cursor-pointer" />
                          </Link>
                        </Tooltip>
                      </div>
                      <MCPServersSettingsTab
                        settings={settings.mcp}
                        setSettings={(mcp) => setSettings({ ...settings, mcp })}
                      />
                    </>
                  )}
                </div>
              </div>
            </ModalBody>

            {/* フッター */}
            <ModalFooter className="border-t border-divider flex justify-between">
              <Button
                color="danger"
                variant="light"
                onPress={handleReset}
                disabled={isSaving || isResetting}
                startContent={
                  isResetting ? <Spinner size="sm" /> : <FiRefreshCw />
                }
              >
                {isResetting ? 'Resetting...' : 'Reset to Defaults'}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="light"
                  onPress={onModalClose}
                  disabled={isSaving || isResetting}
                >
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  disabled={isSaving || isResetting}
                  startContent={isSaving ? <Spinner size="sm" /> : null}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

/** 左側のタブボタン部分を小コンポーネント化 */
function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
        active
          ? 'bg-primary-100/50 dark:bg-primary-900/20 text-primary border-r-2 border-primary'
          : 'hover:bg-default-100 dark:hover:bg-default-100/10'
      }`}
      onClick={onClick}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </div>
  );
}
