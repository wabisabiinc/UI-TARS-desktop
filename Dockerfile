# syntax=docker/dockerfile:1

############################################
# ステージ１：依存解決＆ビルド
############################################
FROM node:18-alpine AS builder
WORKDIR /repo

# 1) グローバルに pnpm と shx を入れる
RUN npm install -g pnpm@9.12.3 shx

# 2) ワークスペース定義＆ロックファイルを先にコピー
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 3) apps と packages を丸ごとコピー
COPY apps     ./apps
COPY packages ./packages

# 4) ワークスペース全体の依存（dependencies + devDependencies）をインストール
#    └─ これで各パッケージの prepare（npm run build）も走り、dist が生成される
RUN pnpm recursive install --frozen-lockfile=false

# 5) mcp-servers/browser パッケージを改めてビルド（もし個別ビルドが必要なら）
WORKDIR /repo/packages/agent-infra/mcp-servers/browser
RUN pnpm run build

############################################
# ステージ２：実行イメージ
############################################
FROM node:18-alpine AS runner
WORKDIR /app

# 6) ビルド成果物をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist

# 7) 実行用 package.json をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package.json ./

# 8) production 依存のみインストール
RUN npm install --production

# 9) デフォルトコマンド
CMD ["node", "dist/server.cjs"]
