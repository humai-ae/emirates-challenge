FROM node:24-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@hrcc/ai...
RUN pnpm --filter=@hrcc/ai --prod deploy /prod/ai

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/ai ./
USER node
EXPOSE 3100
CMD ["node", "dist/main.js"]
