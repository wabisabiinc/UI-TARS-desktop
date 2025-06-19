# ── 1. ビルド用ステージ ─────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# ① リポジトリ全体をコピー
COPY . .

# ② ルートで依存をインストール（devDependencies 含む）
RUN npm install -g pnpm@9 \
  && pnpm install --frozen-lockfile

# ② ヒープサイズ拡大（8GB）
ENV NODE_OPTIONS="--max_old_space_size=8192"


# ③ apps/agent-tars（Vite）をビルド
WORKDIR /app/apps/agent-tars
RUN pnpm exec vite build --config vite.config.web.ts

# ── 2. 本番用ステージ ─────────────────────────
FROM node:20-alpine
WORKDIR /app

# ① ワークスペース設定と各 package.json をすべてコピー
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/agent-tars/package.json ./apps/agent-tars/

# ② husky スクリプト無効化
ENV HUSKY_SKIP_INSTALL=1

# ③ workspace 全体の prod 依存をインストール
RUN npm install -g pnpm@9 \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

# ④ ビルド成果物とサーバーコードを配置
COPY --from=builder /app/apps/agent-tars/dist/web ./dist/web
COPY apps/agent-tars/server.mjs ./

# ⑤ 起動コマンド
EXPOSE 4173