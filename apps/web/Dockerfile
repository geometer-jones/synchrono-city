FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

ARG VITE_CONCIERGE_URL=http://localhost:3000
ARG VITE_NOSTR_RELAY_URL=ws://localhost:8080
ARG VITE_BLOSSOM_URL=http://localhost:3001
ARG VITE_MAPBOX_ACCESS_TOKEN=
ARG VITE_MAPBOX_STYLE_URL=mapbox://styles/mapbox/dark-v11

ENV VITE_CONCIERGE_URL=${VITE_CONCIERGE_URL}
ENV VITE_NOSTR_RELAY_URL=${VITE_NOSTR_RELAY_URL}
ENV VITE_BLOSSOM_URL=${VITE_BLOSSOM_URL}
ENV VITE_MAPBOX_ACCESS_TOKEN=${VITE_MAPBOX_ACCESS_TOKEN}
ENV VITE_MAPBOX_STYLE_URL=${VITE_MAPBOX_STYLE_URL}

RUN pnpm --filter web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
