################ 1) build ################
FROM node:20-bullseye AS build
WORKDIR /app
COPY . .
RUN corepack enable && corepack prepare pnpm@9 --activate \
 && pnpm install --frozen-lockfile=false \
 && pnpm exec electron-forge make --platform linux --targets zip

################ 2) runtime ##############
FROM debian:bullseye-slim
WORKDIR /release
COPY --from=build /app/out/make/*.zip ./
CMD ["bash","-c","echo 'ZIP ready'; sleep infinity"]
