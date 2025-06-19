# syntax=docker/dockerfile:1

############################################
# ステージ１：依存解決（スクリプトはスキップ）
############################################
FROM node:18-alpine AS deps
WORKDIR /repo

# グローバルツール
RUN npm install -g pnpm@9.12.3 shx

# ワークスペース定義＆ロックファイルを先に
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# ソース全体を依存解決用にコピー
COPY apps     ./apps
COPY packages ./packages

# prepare/postinstall を抑止して依存だけインストール
RUN echo "ignore-scripts=true" > .npmrc \
 && pnpm install --frozen-lockfile=false \
 && rm .npmrc

############################################
# ステージ２：依存パッケージのビルド
############################################
FROM deps AS builder
WORKDIR /repo

# 依存先パッケージだけ個別ビルド
RUN cd packages/agent-infra/logger       && pnpm run build
RUN cd packages/agent-infra/browser      && pnpm run build
RUN cd packages/agent-infra/browser-use  && pnpm run build
RUN cd packages/mcp-http-server          && pnpm run build

# 最後に mcp-server-browser をビルド
WORKDIR /repo/packages/agent-infra/mcp-servers/browser
RUN pnpm run build

############################################
# ステージ３：ランタイムイメージ
############################################
FROM node:18-alpine AS runner
WORKDIR /app

# 実行に必要なバンドルをコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package.json ./

# production 依存だけインストール
RUN npm install --production

# サーバー起動
CMD ["node", "dist/server.cjs"]
