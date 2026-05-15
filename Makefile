.PHONY: build run test clean frontend frontend-build frontend-dev frontend-deps \
        daemon-start daemon-stop daemon-status daemon-restart

BINARY = bin/server
PID_FILE = bin/server.pid
LOG_FILE = bin/server.log
GOCACHE ?= /tmp/go-cache
ADDR ?= :8081

build: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go build -buildvcs=false -o $(BINARY) ./cmd/server/

run: build
	$(BINARY)

run-debug: frontend-deps frontend-build
	GOCACHE=$(GOCACHE) go run -buildvcs=false ./cmd/server/ -addr :8080

daemon-start: build
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Server is already running (PID $$(cat $(PID_FILE)))"; \
		exit 1; \
	fi
	@echo "Starting server as daemon..."
	@nohup $(BINARY) -addr $(ADDR) >> $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE)
	@echo "Server started (PID $$(cat $(PID_FILE))). Logs: $(LOG_FILE)"

daemon-stop:
	@if [ ! -f $(PID_FILE) ]; then \
		echo "PID file not found. Server may not be running."; \
		exit 1; \
	fi
	@PID=$$(cat $(PID_FILE)); \
	if kill -0 $$PID 2>/dev/null; then \
		echo "Stopping server (PID $$PID)..."; \
		kill $$PID; \
		rm -f $(PID_FILE); \
		echo "Server stopped."; \
	else \
		echo "Server is not running (stale PID $$PID)."; \
		rm -f $(PID_FILE); \
	fi

daemon-status:
	@if [ ! -f $(PID_FILE) ]; then \
		echo "Server is not running (no PID file)."; \
		exit 1; \
	fi
	@PID=$$(cat $(PID_FILE)); \
	if kill -0 $$PID 2>/dev/null; then \
		echo "Server is running (PID $$PID)."; \
	else \
		echo "Server is not running (stale PID $$PID)."; \
		rm -f $(PID_FILE); \
		exit 1; \
	fi

daemon-restart: daemon-stop daemon-start

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
