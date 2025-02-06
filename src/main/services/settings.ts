import { ipcMain } from 'electron';
import { dispatch } from '../store/create';
import { SettingStore } from '../store/setting';
import { logger } from '../logger';

export function registerSettingsHandlers() {
  ipcMain.handle('setting:importPresetFromFile', async (_, yamlContent) => {
    try {
      const settings = await SettingStore.importPresetFromText(yamlContent);
      dispatch({ type: 'IMPORT_PRESET', payload: settings });
      return settings;
    } catch (error) {
      logger.error('Failed to import preset:', error);
      throw error;
    }
  });

  ipcMain.handle('setting:importPresetFromUrl', async (_, url, autoUpdate) => {
    try {
      const settings = await SettingStore.fetchPresetFromUrl(url);
      dispatch({
        type: 'IMPORT_PRESET',
        payload: {
          ...settings,
          presetSource: { type: 'remote', url, autoUpdate },
        },
      });
      return settings;
    } catch (error) {
      logger.error('Failed to import preset from URL:', error);
      throw error;
    }
  });

  ipcMain.handle('setting:updatePresetFromRemote', async () => {
    dispatch({ type: 'UPDATE_PRESET_FROM_REMOTE', payload: null });
    return SettingStore.getStore();
  });

  ipcMain.handle('setting:resetPreset', () => {
    dispatch({ type: 'REMOVE_SETTING', payload: 'presetSource' });
  });

  ipcMain.handle('setting:clear', () => {
    dispatch({ type: 'CLEAR_SETTINGS', payload: null });
    return SettingStore.getStore();
  });
}
