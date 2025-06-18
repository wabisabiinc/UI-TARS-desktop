######################## 1) build (= builder) stage ########################
FROM node:22.12-alpine AS builder

# ─── 0. pnpm を直接インストール（corepack バグ回避） ──────────────
RUN npm install -g pnpm@9

# ─── 1. ルートを作業ディレクトリに ────────────────────────────────
WORKDIR /repo

# ルートの package.json / pnpm-lock.yaml をコピー（workspace 情報を含む）
COPY package.json pnpm-lock.yaml* ./

# ブラウザ用 workspace の package.json を上書きコピー
COPY packages/agent-infra/mcp-servers/browser/package*.json \
     packages/agent-infra/mcp-servers/browser/

# ─── 2. ブラウザ workspace だけ依存を解決 ────────────────────────
RUN pnpm install --filter "./packages/agent-infra/mcp-servers/browser..." --frozen-lockfile=false

# ─── 3. 必要ソースをコピー ──────────────────────────────────────
COPY packages/agent-infra/mcp-servers/browser \
     packages/agent-infra/mcp-servers/browser
COPY packages/agent-infra/mcp-servers/filesystem/src \
     packages/agent-infra/mcp-servers/browser/src/filesystem

# ─── 4. ビルド ───────────────────────────────────────────────────
RUN pnpm --filter "./packages/agent-infra/mcp-servers/browser..." run build

######################## 2) runtime (= release) stage ######################
FROM node:22-alpine AS release

ENV NODE_ENV=production
WORKDIR /app

# ビルド成果物と package.json をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package*.json ./

# pnpm を再インストールして本番依存のみ取得
RUN npm install -g pnpm@9 \
 && pnpm install --prod --frozen-lockfile=false --ignore-scripts

ENTRYPOINT ["node", "dist/index.js"]
