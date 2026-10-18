.PHONY: dev server parser build web-build embed test docker docker-standalone docker-all clean

VERSION ?= dev
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
DATE    ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
MODULE  := $(shell head -1 go.mod | awk '{print $$2}')
LDFLAGS := -ldflags "-s -w -X $(MODULE)/pkg/version.Version=$(VERSION) -X $(MODULE)/pkg/version.Commit=$(COMMIT) -X $(MODULE)/pkg/version.Date=$(DATE)"

dev:
	go run ./cmd/warehouse-server

server:
	go build $(LDFLAGS) -o bin/warehouse-server ./cmd/warehouse-server

parser:
	go build $(LDFLAGS) -o bin/warehouse-parser ./cmd/warehouse-parser

build: server parser

web-build:
	cd web && pnpm install && pnpm run build

embed: web-build
	rm -rf cmd/warehouse-server/dist && mkdir -p cmd/warehouse-server/dist && cp -r web/dist/* cmd/warehouse-server/dist/
	go build -tags embed_frontend $(LDFLAGS) -o bin/warehouse-server ./cmd/warehouse-server
	rm -rf cmd/warehouse-server/dist

test:
	go test -v ./...

docker:
	docker build -t warehouse-parser .

docker-standalone:
	docker build -t warehouse-parser:latest-standalone -f Dockerfile.standalone .

docker-all: docker docker-standalone

clean:
	rm -rf bin/ cmd/warehouse-server/dist/
