FROM golang:1.25-alpine AS shim-builder
WORKDIR /app

COPY apps/concierge/go.mod apps/concierge/go.sum ./apps/concierge/
RUN cd apps/concierge && go mod download

COPY apps/concierge ./apps/concierge
RUN cd apps/concierge && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/relay-shim ./cmd/relay-shim

FROM ubuntu:24.04 AS strfry-builder
WORKDIR /src

RUN apt-get update && apt-get install -y --no-install-recommends \
  git g++ make perl \
  libssl-dev zlib1g-dev liblmdb-dev libflatbuffers-dev libsecp256k1-dev libzstd-dev \
  libyaml-perl libtemplate-perl libregexp-grammars-perl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/hoytech/strfry.git /src/strfry && \
  cd /src/strfry && \
  git submodule update --init && \
  make setup-golpe && \
  make -j"$(nproc)"

FROM ubuntu:24.04
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bash && \
  rm -rf /var/lib/apt/lists/*

COPY --from=strfry-builder /src/strfry/strfry /usr/local/bin/strfry
COPY --from=shim-builder /out/relay-shim /usr/local/bin/relay-shim
COPY deploy/relay/entrypoint.sh /usr/local/bin/relay-entrypoint.sh
COPY deploy/relay/strfry.conf.tpl /etc/strfry.conf.tpl

RUN chmod +x /usr/local/bin/relay-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/relay-entrypoint.sh"]
