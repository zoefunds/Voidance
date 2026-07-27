# Build context is the REPO ROOT (see deployment/fly.toml: `context = ".."`)
# so this image can bundle database/migrations alongside the backend code.
FROM node:20-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY backend/src/db/migrate.ts ./src/db/migrate.ts
COPY database ./database

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
