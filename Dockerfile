# ── 1. ビルドステージ ─────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# ① リポジトリ全体をコピーして依存をインストール
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

# ① ワークスペース設定＆各 package.json を用意
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/agent-tars/package.json ./apps/agent-tars/

# ② husky スクリプト無効化
ENV HUSKY_SKIP_INSTALL=1

# ③ 本番依存のみインストール（scripts も無視）
RUN npm install -g pnpm@9 \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

# ④ ビルド成果物とサーバーコードを配置
COPY --from=builder /app/apps/agent-tars/dist/web ./dist/web
COPY apps/agent-tars/server.mjs ./

# ⑤ ポート公開（Render の指定 ENV PORT を利用）
EXPOSE ${PORT:-4173}

# ⑥ サーバー起動コマンド
CMD ["node", "server.mjs"]
