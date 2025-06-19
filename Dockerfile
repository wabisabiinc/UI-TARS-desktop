# syntax=docker/dockerfile:1

# ── ステージ１：依存解決＆ビルド
FROM node:18-alpine AS builder
WORKDIR /repo

# → 必要に応じてビルドキャッシュ効かせる
RUN npm install -g pnpm@9.12.3

# 1) ワークスペース定義＆ロックファイルを最初にコピー
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 2) ワークスペース内のソースを一括コピー（依存解決用）
COPY apps     ./apps
COPY packages ./packages

# 3) 依存をインストール（devDeps 含む）
RUN pnpm recursive install --frozen-lockfile=false

# 4) ビルド対象ディレクトリに移動してビルド
WORKDIR /repo/packages/agent-infra/mcp-servers/browser
RUN pnpm run build

# ── ステージ２：実行イメージ
FROM node:18-alpine AS runner
WORKDIR /app

# 5) ビルド成果物をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/dist ./dist

#6) 実行に必要な package.json をコピー
COPY --from=builder /repo/packages/agent-infra/mcp-servers/browser/package.json ./
# 7) production dependencies のみインストール
RUN npm install --production

# （必要ならポート解放）
# EXPOSE 3000

# 8) 実行コマンド
CMD ["node", "dist/server.cjs"]
