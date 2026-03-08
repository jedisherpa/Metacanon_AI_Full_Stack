# === Build Stage ===
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY engine/package.json ./engine/package.json
RUN npm install --no-fund --no-audit

COPY . .
RUN npm run build --workspaces

# === Runtime Stage ===
FROM node:20-alpine
WORKDIR /app
ENV PORT=3001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/engine/dist ./engine/dist
COPY --from=builder /app/engine/drizzle ./engine/drizzle
COPY --from=builder /app/engine/drizzle.config.ts ./engine/drizzle.config.ts
COPY --from=builder /app/engine/package.json ./engine/package.json
COPY --from=builder /app/governance ./governance
COPY --from=builder /app/lens-packs ./lens-packs

EXPOSE 3001
CMD ["node", "engine/dist/index.js"]
