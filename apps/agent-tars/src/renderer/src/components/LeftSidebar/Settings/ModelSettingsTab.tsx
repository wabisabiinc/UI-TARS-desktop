// src/renderer/components/ModelSettingsTab.tsx

import { useState, useEffect } from 'react';
import {
  Input,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Button,
} from '@nextui-org/react';
import { ModelSettings, ModelProvider } from '@agent-infra/shared';
import { getProviderLogo, getModelOptions } from './modelUtils';
import { useProviders } from './useProviders';
import { PasswordInput } from '@renderer/components/PasswordInput';
import toast from 'react-hot-toast';
import { useAppSettings } from './useAppSettings';
import { FiAlertCircle, FiZap } from 'react-icons/fi';

interface ModelSettingsTabProps {
  settings: ModelSettings;
  setSettings: (settings: ModelSettings) => void;
}

export function ModelSettingsTab({
  settings,
  setSettings,
}: ModelSettingsTabProps) {
  const { providers, loading } = useProviders();
  const [useCustomModel, setUseCustomModel] = useState(false);
  const isAzure = settings.provider === ModelProvider.AZURE_OPENAI;
  const isAnthropic = settings.provider === ModelProvider.ANTHROPIC;
  const showNonClaudeWarning = !!settings.provider && !isAnthropic;

  // Test Model Provider 用
  const { testModelProvider } = useAppSettings();

  // プリセットにないモデル名なら「カスタム」に切り替える
  useEffect(() => {
    if (!settings.model) return;
    const opts = getModelOptions(settings.provider).map((o) => o.value);
    setUseCustomModel(!opts.includes(settings.model));
  }, [settings.provider, settings.model]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner label="Loading providers..." />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {showNonClaudeWarning && (
        <div className="flex items-center p-3 bg-warning-50 rounded-lg border border-warning-200">
          <FiAlertCircle className="text-warning-600 mr-2" size={20} />
          <p className="text-sm text-warning-700">
            Non-Claude model selected. May result in degraded performance.
          </p>
        </div>
      )}

      {/* プロバイダー選択 */}
      <Select
        label="Provider"
        selectedKeys={[settings.provider]}
        onChange={(e) =>
          setSettings({ ...settings, provider: e.target.value, model: '' })
        }
        disallowEmptySelection
        startContent={getProviderLogo(settings.provider)}
      >
        {providers.map((p) => (
          <SelectItem
            key={p}
            value={p}
            startContent={getProviderLogo(p as ModelProvider)}
          >
            {p}
          </SelectItem>
        ))}
      </Select>

      {/* モデル名入力 or プリセット */}
      {isAzure ? (
        <Input
          label="Azure Model Name"
          placeholder="Your deployment name"
          value={settings.model}
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
          isRequired
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span>Use custom model name</span>
            <Switch
              isSelected={useCustomModel}
              onValueChange={setUseCustomModel}
            />
          </div>
          {useCustomModel ? (
            <Input
              label="Model Name"
              placeholder="Enter custom model identifier"
              value={settings.model}
              onChange={(e) =>
                setSettings({ ...settings, model: e.target.value })
              }
              isRequired
            />
          ) : (
            <Select
              label="Model"
              selectedKeys={settings.model ? [settings.model] : []}
              onChange={(e) =>
                setSettings({ ...settings, model: e.target.value })
              }
              disallowEmptySelection
            >
              {getModelOptions(settings.provider).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </Select>
          )}
        </>
      )}

      {/* API Key */}
      <PasswordInput
        label="API Key"
        placeholder="sk-••••"
        value={settings.apiKey}
        onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
      />

      {/* API Version */}
      <Input
        label="API Version"
        placeholder="e.g. 2023-05-15"
        value={settings.apiVersion ?? ''}
        onChange={(e) =>
          setSettings({ ...settings, apiVersion: e.target.value })
        }
      />

      {/* Custom Endpoint */}
      <Input
        label="Custom Endpoint"
        placeholder="https://..."
        value={settings.endpoint ?? ''}
        onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
      />

      {/* Test Model Provider */}
      <div className="mt-6 flex items-center gap-4">
        <Button
          color="primary"
          onClick={async () => {
            try {
              const ok = await testModelProvider(settings.model);
              if (ok) toast.success('Model Provider 接続 OK!');
              else toast.error('接続に失敗しました。設定を確認してください。');
            } catch (err: any) {
              toast.error('テスト中にエラー: ' + err.message);
            }
          }}
          startContent={<FiZap size={18} />}
        >
          Test Model Provider
        </Button>
        <span className="text-xs text-default-400">
          Note: 少量のトークンを消費します
        </span>
      </div>
    </div>
  );
}
