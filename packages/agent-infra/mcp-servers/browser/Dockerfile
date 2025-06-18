######################## 1) build stage ########################
FROM node:22.12-alpine AS builder

# 0. グローバル CLI を入れ、pnpm をセット
RUN npm install -g pnpm@9 shx

# 1. ルートを作業ディレクトリに
WORKDIR /repo

# 2. ワークスペース全体の依存を解決
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages/*/*/package.json packages/*/*/package.json
RUN pnpm install --frozen-lockfile=false               # ← ここで rslib も入る

# 3. 必要ソースをコピー
COPY packages/agent-infra/mcp-servers/browser \
     packages/agent-infra/mcp-servers/browser
COPY packages/agent-infra/mcp-servers/filesystem/src \
     packages/agent-infra/mcp-servers/browser/src/filesystem

# 4. ブラウザ workspace だけビルド
RUN pnpm --filter "./packages/agent-infra/mcp-servers/browser..." run build

# 5. 不要な devDependencies を削除して容量削減
RUN pnpm prune --prod

######################## 2) runtime stage ######################
FROM node:22-alpine AS release

ENV NODE_ENV=production
WORKDIR /app

# ビルド成果物と package.json をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package*.json ./

# 本番依存のみインストール
RUN npm install -g pnpm@9 \
 && pnpm install --prod --frozen-lockfile=false --ignore-scripts

ENTRYPOINT ["node", "dist/index.js"]
