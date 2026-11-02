# Build on the builder's native architecture and cross-compile for the target:
# no QEMU emulation, whether the arm64 image (Graviton) is built on arm64 or amd64.
# Base images are pinned by digest (immutable); Dependabot bumps tag and digest together.
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine3.24@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS build
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
FROM alpine:3.24@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
WORKDIR /app
COPY --from=build /api /app/api
COPY migrations ./migrations
COPY config ./config
COPY seed ./seed
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/api"]
