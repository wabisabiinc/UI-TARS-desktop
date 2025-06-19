FROM node:20-alpine AS builder
WORKDIR /app

# ① モノレポ全体の依存を一旦インストール
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 \
  && pnpm install --frozen-lockfile

# ② apps/agent-tars の中身をコピー
COPY apps/agent-tars ./apps/agent-tars

# ③ Vite（renderer）のビルド
WORKDIR /app/apps/agent-tars
RUN pnpm run build:web      # package.json に定義されている build:web を実行

# ── 2. 本番用ステージ ─────────────────────────
FROM node:20-alpine
WORKDIR /app

# ④ 本番依存のみをインストール（husky やスクリプト実行はスキップ）
COPY package.json pnpm-lock.yaml ./
ENV HUSKY_SKIP_INSTALL=1
RUN npm install -g pnpm@9 \
  && pnpm install --prod --frozen-lockfile --ignore-scripts

# ⑤ ビルド済み静的ファイルとサーバーコードを配置
COPY --from=builder /app/apps/agent-tars/dist/web ./dist/web
COPY apps/agent-tars/server.mjs ./

# ⑥ ポートを開放してサーバー起動
ENV PORT=4173
EXPOSE 4173
CMD ["node", "server.mjs"]
