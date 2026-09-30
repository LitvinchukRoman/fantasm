FROM golang:1.25.11-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -o /api ./cmd/api

FROM alpine:3.23
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /api /app/api
COPY migrations ./migrations
COPY config ./config
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/api"]
