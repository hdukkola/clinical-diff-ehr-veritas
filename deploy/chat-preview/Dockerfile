FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.ts tsconfig.json ./
COPY src ./src
COPY fresh-backend ./fresh-backend
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_CLINICAL_DIFF_CLOUD_CHAT=1
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
