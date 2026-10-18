# Multi-stage Dockerfile for Warehouse Parser & Server

# Stage 1: Build SolidJS Frontend with pnpm
FROM node:22-alpine AS frontend-builder
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml* web/pnpm-workspace.yaml* ./
RUN npm install -g $(node -p "require('./package.json').packageManager")
RUN pnpm install
COPY web/ ./
RUN pnpm run build

# Stage 2: Build Go Server
FROM golang:1.27-alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
# Copy frontend build output into embed path
COPY --from=frontend-builder /web/dist ./cmd/warehouse-server/dist
ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown

RUN CGO_ENABLED=0 GOOS=linux go build -tags embed_frontend \
    -ldflags="-s -w \
    -X github.com/awang-karisma/warehouse-parser/pkg/version.Version=${VERSION} \
    -X github.com/awang-karisma/warehouse-parser/pkg/version.Commit=${COMMIT} \
    -X github.com/awang-karisma/warehouse-parser/pkg/version.Date=${DATE}" \
    -o /app/warehouse-server ./cmd/warehouse-server

# Stage 3: Minimal runtime image
FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

COPY --from=backend-builder /app/warehouse-server /app/warehouse-server

ENV PORT=8080 \
    DB_PATH=/data/warehouse.db

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/app/warehouse-server"]
