FROM golang:1.25-alpine AS build
WORKDIR /app

COPY apps/concierge/go.mod apps/concierge/go.sum ./apps/concierge/
RUN cd apps/concierge && go mod download

COPY apps/concierge ./apps/concierge
COPY db ./db

RUN cd apps/concierge && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/concierge ./cmd/concierge
RUN cd apps/concierge && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/relay-shim ./cmd/relay-shim
RUN cd apps/concierge && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/migrate ./cmd/migrate

FROM alpine:3.22
WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=build /out/concierge /usr/local/bin/concierge
COPY --from=build /out/relay-shim /usr/local/bin/relay-shim
COPY --from=build /out/migrate /usr/local/bin/migrate
COPY db /app/db

EXPOSE 3000

ENTRYPOINT ["concierge"]
