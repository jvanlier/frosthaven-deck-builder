FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM --platform=$BUILDPLATFORM node:22-alpine AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM --platform=$TARGETPLATFORM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

RUN mkdir /data && chown node:node /data

USER node

EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["node", "dist/server/index.js"]
