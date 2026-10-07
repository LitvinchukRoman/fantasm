# Build on the builder's native architecture and cross-compile for the target:
# no QEMU emulation, whether the arm64 image (Graviton) is built on arm64 or amd64.
# Base images are pinned by digest (immutable); Dependabot bumps tag and digest together.
FROM --platform=$BUILDPLATFORM golang:1.27.1-alpine3.24@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS build
ARG TARGETOS=linux
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /api ./cmd/api

# The final stage has no RUN step, so building the arm64 image on an amd64 runner
# needs no QEMU. TLS roots come from the (native) build stage instead of apk.
FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
WORKDIR /app
COPY --from=build /api /app/api
COPY migrations ./migrations
COPY config ./config
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/api"]
