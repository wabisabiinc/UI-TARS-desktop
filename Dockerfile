# ベースに Node を使う
FROM node:20-alpine AS builder

WORKDIR /app

# ① 依存パッケージをインストール
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile

# ② フロントをビルド
COPY apps/agent-tars/src/renderer ./src/renderer
WORKDIR /app/src/renderer
RUN pnpm run build

# ――――――――――――――――――――――――――――――――――

# 本番用イメージ
FROM node:20-alpine

WORKDIR /app

# ③ サーバー依存を再インストール（軽量化のため）
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@9 && pnpm install --prod --frozen-lockfile

# ④ ビルド成果物をコピー
COPY --from=builder /app/src/renderer/dist/web ./dist/web
COPY apps/agent-tars/server.mjs ./

# ⑤ ポートを開放
ENV PORT 4173
EXPOSE 4173

# ⑥ デフォルトコマンド
CMD ["node", "server.mjs"]
