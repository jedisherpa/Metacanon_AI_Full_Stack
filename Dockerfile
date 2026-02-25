# === Build Stage ===
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY engine/package.json ./engine/package.json
COPY skins/council-nebula/package.json ./skins/council-nebula/package.json
RUN npm ci

COPY . .
RUN npm run build --workspaces

# === Runtime Stage ===
FROM node:20-alpine
WORKDIR /app
ENV PORT=8080

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/engine/dist ./engine/dist
COPY --from=builder /app/engine/drizzle ./engine/drizzle
COPY --from=builder /app/engine/package.json ./engine/package.json
COPY --from=builder /app/lens-packs ./lens-packs

EXPOSE 8080
CMD ["node", "engine/dist/index.js"]
