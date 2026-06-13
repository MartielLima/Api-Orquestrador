# syntax=docker/dockerfile:1.7

# ---- builder stage ---------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install all deps (dev + prod). --ignore-scripts because the
# sascar-sdk git dep ships with `"files": ["dist"]` which means a fresh
# `npm install` only copies the empty dist/ — we rebuild it below.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

# Build sascar-sdk from source: clone the repo, install its deps, run tsc,
# then copy package.json + dist into our node_modules.
ARG SASCAR_SDK_REPO=https://github.com/MartielLima/sascar-sdk.git
ARG SASCAR_SDK_REF=main
RUN apk add --no-cache git python3 make g++ \
 && git clone --depth 1 --branch ${SASCAR_SDK_REF} ${SASCAR_SDK_REPO} /tmp/sascar-sdk \
 && cd /tmp/sascar-sdk \
 && npm ci --include=dev --ignore-scripts \
 && npm run build \
 && rm -rf node_modules/sascar-sdk \
 && mkdir -p /app/node_modules/sascar-sdk \
 && cp -r /tmp/sascar-sdk/package.json /tmp/sascar-sdk/dist /app/node_modules/sascar-sdk/ \
 && rm -rf /tmp/sascar-sdk

# Rebuild native modules (bcrypt) that need postinstall scripts. We ran
# `npm ci --ignore-scripts` above so the .node bindings weren't built.
RUN npm rebuild bcrypt

# Build the app (src/scripts/* is now included via the same tsc invocation)
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Strip devDeps to keep node_modules small for the runtime image.
# bcrypt's native binding is preserved because it's a prod dep.
RUN npm prune --omit=dev && \
    apk del git python3 make g++

# ---- runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# wget is used by the docker-compose healthcheck
RUN apk add --no-cache wget tini

ENV NODE_ENV=production

# Copy only what the app needs at runtime
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/src/db/migrations ./src/db/migrations
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 4000

# tini = PID 1 + signal forwarding; entrypoint handles migrations + seed
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
