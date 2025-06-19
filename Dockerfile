# syntax=docker/dockerfile:1

############################################
# ステージ１：依存解決
############################################
FROM node:18-alpine AS deps
WORKDIR /repo

# 1) グローバルツール
RUN npm install -g pnpm@9.12.3 shx

# 2) ワークスペース定義＆ロックファイルをコピー
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 3) 全ソースをコピー（依存解決用）
COPY apps     ./apps
COPY packages ./packages

# 4) npm install 時に各パッケージの prepare/build script をスキップさせる設定
#    → packages/common/electron-build の d.tsジェネレーション失敗を回避
RUN echo "ignore-scripts=true" > .npmrc

# 5) 依存解決だけ実行
RUN pnpm install --frozen-lockfile=false

# 6) スクリプト実行を戻す
RUN rm .npmrc

############################################
# ステージ２：対象パッケージのビルド
############################################
FROM deps AS builder
WORKDIR /repo/packages/agent-infra/mcp-servers/browser

# 7) ここで初めてブラウザ用サーバーだけビルド
RUN pnpm run build

############################################
# ステージ３：ランタイムイメージ
############################################
FROM node:18-alpine AS runner
WORKDIR /app

# 8) ビルド成果物をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist

# 9) package.json（production deps 用）をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package.json ./

# 10) productionのみインストール
RUN npm install --production

# 11) 実行コマンド
CMD ["node", "dist/server.cjs"]
