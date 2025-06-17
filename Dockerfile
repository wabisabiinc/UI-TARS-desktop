######################## 1) build stage ########################
FROM node:20-bullseye AS build
WORKDIR /app

# プロジェクト全体をコピー
COPY . .

# 依存インストール & Linux 用 Zip を作成
RUN corepack enable \
 && corepack prepare pnpm@9 --activate \
 && pnpm install --frozen-lockfile=false \
 && pnpm exec electron-forge make --platform linux --targets zip


######################## 2) runtime (= artifact) stage ########################
FROM debian:bullseye-slim      # わずか 22 MB の極小イメージ
WORKDIR /release

# Forge の生成物（*.zip）だけコピー
COPY --from=build /app/out/make/*.zip ./

# このコンテナ自体は実行するものが無いので no-op
CMD ["bash", "-c", "echo 'ZIP artifacts ready'; sleep infinity"]
