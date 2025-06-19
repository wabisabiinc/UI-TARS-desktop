# ── 1. ビルドステージ ─────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# ① リポジトリ全体をコピーして devDependencies 含む依存をインストール
COPY . .
RUN npm install -g pnpm@9 \
  && pnpm install --frozen-lockfile

# ② Vite ビルド時のメモリ不足対策
ENV NODE_OPTIONS="--max_old_space_size=8192"

# ③ apps/agent-tars の Vite ビルド
WORKDIR /app/apps/agent-tars
RUN pnpm exec vite build --config vite.config.web.ts

# ── 2. 本番ステージ ─────────────────────────
FROM node:20-alpine
WORKDIR /app

# ① ビルドステージで揃えた node_modules と lockfile/workspace 定義を丸ごとコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# ② ビルド成果物とサーバーコードを配置
COPY --from=builder /app/apps/agent-tars/dist/web ./dist/web
COPY apps/agent-tars/server.mjs ./

# ③ ポート公開（Render の ENV PORT をそのまま利用）
EXPOSE ${PORT:-4173}

# ④ サーバー起動コマンド
CMD ["node", "server.mjs"]
