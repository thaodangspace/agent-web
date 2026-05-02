.PHONY: build run test clean

BINARY = bin/server
GOCACHE ?= /tmp/go-cache

build:
	GOCACHE=$(GOCACHE) go build -buildvcs=false -o $(BINARY) ./cmd/server/

run: build
	$(BINARY)

run-debug:
	GOCACHE=$(GOCACHE) go run -buildvcs=false ./cmd/server/ -addr :8080

test:
	GOCACHE=$(GOCACHE) go test -buildvcs=false ./...

clean:
	rm -rf bin/

deps:
	GOCACHE=$(GOCACHE) go mod tidy
