# ── 1. ビルド用ステージ ─────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# ① リポジトリ全体をコピー
COPY . .

# ② ルートで依存をインストール（devDependencies 含む）
RUN npm install -g pnpm@9 \
  && pnpm install --frozen-lockfile

# ③ apps/agent-tars（Vite）をビルド
WORKDIR /app/apps/agent-tars
RUN pnpm run build:web

# ── 2. 本番用ステージ ─────────────────────────
FROM node:18-alpine
WORKDIR /app

# ④ 本番依存のみをインストール（husky 等スキップ）
COPY package.json pnpm-lock.yaml ./
ENV HUSKY_SKIP_INSTALL=1
RUN npm install -g pnpm@9 \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

# ⑤ ビルド済み静的ファイルとサーバーコードを配置
COPY --from=builder /app/apps/agent-tars/dist/web ./dist/web
COPY apps/agent-tars/server.mjs ./

# ⑥ ポート設定とサーバー起動
ENV PORT=4173
EXPOSE 4173
CMD ["node", "server.mjs"]
