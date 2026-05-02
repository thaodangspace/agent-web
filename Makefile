.PHONY: build run test clean frontend frontend-build frontend-dev frontend-deps

BINARY = bin/server
GOCACHE ?= /tmp/go-cache

build: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go build -buildvcs=false -o $(BINARY) ./cmd/server/

run: build
	$(BINARY)

run-debug: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go run -buildvcs=false ./cmd/server/ -addr :8080

frontend:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-deps:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev -- --host

test:
	GOCACHE=$(GOCACHE) go test -buildvcs=false ./...

clean:
	rm -rf bin/
	cd frontend && rm -rf dist/ node_modules/

deps:
	GOCACHE=$(GOCACHE) go mod tidy
