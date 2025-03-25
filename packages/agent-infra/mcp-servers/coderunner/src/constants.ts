/**
 * The following code is modified based on
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/src/constants.ts
 *
 * MIT License
 * Copyright (c) 2025 Jun Han
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/LICENSE
 */
export const languageIdToExecutorMap = {
  javascript: 'node',
  php: 'php',
  python: 'python -u',
  perl: 'perl',
  perl6: 'perl6',
  ruby: 'ruby',
  go: 'go run',
  lua: 'lua',
  groovy: 'groovy',
  powershell: 'powershell -ExecutionPolicy ByPass -File',
  bat: 'cmd /c',
  shellscript: 'bash',
  fsharp: 'fsi',
  csharp: 'scriptcs',
  vbscript: 'cscript //Nologo',
  typescript: 'ts-node',
  coffeescript: 'coffee',
  scala: 'scala',
  swift: 'swift',
  julia: 'julia',
  crystal: 'crystal',
  ocaml: 'ocaml',
  r: 'Rscript',
  applescript: 'osascript',
  clojure: 'lein exec',
  racket: 'racket',
  scheme: 'csi -script',
  ahk: 'autohotkey',
  autoit: 'autoit3',
  dart: 'dart',
  haskell: 'runhaskell',
  nim: 'nim compile --verbosity:0 --hints:off --run',
  lisp: 'sbcl --script',
  kit: 'kitc --run',
  v: 'v run',
  sass: 'sass --style expanded',
  scss: 'scss --style expanded',
};

export const languageIdToFileExtensionMap = {
  javascript: 'js',
  typescript: 'ts',
  powershell: 'ps1',
};
