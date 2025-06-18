######################## 1) build  stage ########################
FROM node:22.12-alpine AS builder

# 0. グローバルに必要ツールと pnpm を入れる
RUN npm install -g pnpm@9 shx rslib

# 1. ルートを作業ディレクトリに
WORKDIR /repo

# 2. 依存解決に必要なメタファイルだけコピー
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

#   すべてのサブパッケージの package.json を先にコピー
COPY packages/*/*/package.json packages/*/*/package.json

# 3. ブラウザ workspace だけ依存インストール（devDeps 含む）
RUN pnpm install --filter "./packages/agent-infra/mcp-servers/browser..." --frozen-lockfile=false

# 4. 必要ソースをコピー
COPY packages/agent-infra/mcp-servers/browser \
     packages/agent-infra/mcp-servers/browser
COPY packages/agent-infra/mcp-servers/filesystem/src \
     packages/agent-infra/mcp-servers/browser/src/filesystem

# 5. ビルド
RUN pnpm --filter "./packages/agent-infra/mcp-servers/browser..." run build

# 6. devDependencies を削除して容量削減
RUN pnpm prune --prod

######################## 2) runtime  stage ######################
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
