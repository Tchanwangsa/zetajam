# One image, frontend inside it. Runs anywhere that can run a container and
# hold a connection open — Cloud Run is what this is aimed at.
FROM node:22-alpine AS web
WORKDIR /app
# pnpm, not npm: pnpm-lock.yaml is the lockfile this project actually updates,
# and it is what Vercel builds the page from. An npm lockfile alongside it only
# drifts, and `npm ci` fails on the drift.
RUN npm install -g pnpm@10
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml web/
RUN cd web && pnpm install --frozen-lockfile
COPY web web
RUN cd web && pnpm run build

FROM golang:1.22-alpine AS go
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY server server
COPY internal internal
COPY --from=web /app/server/dist server/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /zetajam ./server

FROM gcr.io/distroless/static-debian12
COPY --from=go /zetajam /zetajam
# Cloud Run overrides this with its own PORT; the binary reads it either way.
ENV PORT=8080
EXPOSE 8080
# ORIGINS is only needed when the page is hosted somewhere else — set it to the
# static host's origin, e.g. ORIGINS=https://zetajam.pages.dev
ENTRYPOINT ["/zetajam"]
