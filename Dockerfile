# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.app.json tsconfig.server.json vite.config.ts ./
COPY public ./public
COPY scripts/admin.ts ./scripts/admin.ts
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    BLOG_HOST=0.0.0.0 \
    BLOG_PORT=3000 \
    BLOG_DATA_DIR=/app/data
WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist/server/server/index.js"]
