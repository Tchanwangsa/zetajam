FROM node:22-alpine AS web
WORKDIR /app
COPY web/package*.json web/
RUN cd web && npm ci
COPY web web
RUN cd web && npm run build

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
EXPOSE 8080
ENTRYPOINT ["/zetajam"]
