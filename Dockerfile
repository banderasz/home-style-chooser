# Two stages: build the static bundle, then ship it with the tiny vote server.
FROM node:22-alpine AS build
WORKDIR /app
# Install against the lockfile first so the layer caches across source changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8071 DATA_DIR=/app/data
# No runtime dependencies: server.mjs uses only the Node standard library.
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/data/ignored.json ./src/data/ignored.json
COPY server.mjs ./
EXPOSE 8071
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://localhost:8071/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
