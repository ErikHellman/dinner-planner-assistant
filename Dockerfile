# syntax=docker/dockerfile:1

# --- Build stage: needs devDependencies (vite, svelte, adapter-node) ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# "prepare" runs `svelte-kit sync || echo ''` — a safe no-op before sources exist.
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime stage: production deps + adapter-node output only ---
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/build ./build
# Mount point for ./data; writable by "node" even without a bind mount.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
# The Pi SDK writes to $HOME/.pi/agent; /home/node is node-owned in the official image.
ENV HOME=/home/node
ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000
# Not `npm start`: its --env-file=.env hard-fails when .env is absent.
CMD ["node", "build"]
