######################## 1) build (= builder) stage ########################
FROM node:22.12-alpine AS builder

# ─── 0. pnpm を使えるように ───────────────────────────────────────
RUN corepack enable && corepack prepare pnpm@9 --activate

# ─── 1. 作業ディレクトリはブラウザ用パッケージ ────────────────
WORKDIR /repo

# ルートの package.json／pnpm-lock.yaml（ワークスペース情報）を先にコピー
COPY package.json pnpm-lock.yaml* ./

# ブラウザワークスペースの package.json だけ上書きコピー
COPY packages/agent-infra/mcp-servers/browser/package*.json \
     packages/agent-infra/mcp-servers/browser/

# ─── 2. 依存インストール（ブラウザだけ） ────────────────────
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter "./packages/agent-infra/mcp-servers/browser..." --frozen-lockfile=false

# ─── 3. 必要なソース一式をコピー ─────────────────────────────
COPY packages/agent-infra/mcp-servers/browser \
     packages/agent-infra/mcp-servers/browser
COPY packages/agent-infra/mcp-servers/filesystem/src \
     packages/agent-infra/mcp-servers/browser/src/filesystem

# ─── 4. ビルド（例: ts-node, vite など適宜変更） ──────────────
RUN pnpm --filter "./packages/agent-infra/mcp-servers/browser..." run build

######################## 2) runtime (= artifact) stage ########################
FROM node:22-alpine AS release

ENV NODE_ENV=production
WORKDIR /app

# ビルド成果物をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package*.json ./

# ─── 本番依存だけインストール ────────────────────────────────
RUN corepack enable && corepack prepare pnpm@9 --activate \
 && pnpm install --prod --frozen-lockfile=false --ignore-scripts

ENTRYPOINT ["node", "dist/index.js"]
