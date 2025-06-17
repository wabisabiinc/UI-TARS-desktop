########################
#  build stage
########################
FROM node:20-bullseye AS build
WORKDIR /app
COPY . .
# pnpm を有効化して依存をインストール
RUN corepack enable \
 && corepack prepare pnpm@9.12.3 --activate \
 && pnpm install --frozen-lockfile=false \
 && pnpm exec electron-forge make --targets zip

########################
#  runtime stage
########################
FROM debian:bullseye-slim
WORKDIR /app
COPY --from=build /app/out/make .
# Electron アプリ起動コマンド（実ファイル名に合わせて変更可）
CMD ["./squirrel.windows/x64/Agent TARS.exe"]
