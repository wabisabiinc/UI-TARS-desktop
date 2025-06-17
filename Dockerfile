########## build stage ##########
FROM electronuserland/builder:wine AS build
WORKDIR /app

# pnpm と依存
RUN corepack enable \
 && corepack prepare pnpm@9.12.3 --activate
COPY . .
RUN pnpm install --frozen-lockfile=false \
 && pnpm exec electron-forge make 

########## runtime stage ##########
FROM debian:bullseye-slim
WORKDIR /app
COPY --from=build /app/out/make .
CMD ["./squirrel.windows/x64/Agent TARS.exe"]
