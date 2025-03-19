import { useThemeMode } from '@renderer/hooks/useThemeMode';
import { Editor, loader } from '@monaco-editor/react';
import { defaultEditorOptions } from '@renderer/utils/monacoConfig';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { isReportHtmlMode } from '@renderer/constants';

interface MonacoEditorProps {
  language: string;
  value: string;
  readOnly?: boolean;
  height?: string | number;
}

loader.config({
  paths: {
    vs: isReportHtmlMode
      ? 'https://unpkg.com/monaco-editor@0.44.0/min/vs'
      : 'monaco-editor/esm/vs',
  },
  'vs/nls': {
    availableLanguages: {},
  },
  monaco,
});

if (window.MonacoEnvironment === undefined && !isReportHtmlMode) {
  window.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') {
        return new jsonWorker();
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }
      return new editorWorker();
    },
  };
}

export function MonacoEditor({
  language,
  value,
  readOnly = true,
  height = '100%',
}: MonacoEditorProps) {
  const isDarkMode = useThemeMode();

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme={isDarkMode.value ? 'vs-dark' : 'vs'}
      options={{
        ...defaultEditorOptions,
        readOnly,
      }}
      loading={
        <div className="flex items-center justify-center h-full text-gray-500">
          Loading editor...
        </div>
      }
      beforeMount={(monaco) => {
        monaco.editor.onDidCreateModel(() => {});
      }}
    />
  );
}
