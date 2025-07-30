.PHONY: build run test clean setup migrate fmt lint validate start-forks stop-forks dev-setup dev-stop logs dev

# Build the relayer binary
build:
	go build -o bin/relayer cmd/relayer/main.go

# Run the relayer
run: build
	./bin/relayer

# Run tests
test:
	go test ./...

# Clean up build artifacts and development files
clean:
	rm -rf bin/
	rm -f relayer.log
	rm -rf data/

# Development setup
setup: clean
	./scripts/setup.sh

# Database migration
migrate:
	go run cmd/migrate/main.go

# Code formatting
fmt:
	go fmt ./...

# Static analysis
lint:
	golangci-lint run

# Configuration validation
validate:
	./scripts/validate-config.sh

# Fork management
start-forks:
	./scripts/start-forks.sh

stop-forks:
	./scripts/stop-forks.sh

# Development environment with Docker
dev-setup:
	docker-compose up -d postgres

dev-stop:
	docker-compose down

# View logs
logs:
	tail -f relayer.log

# Full development loop
dev: start-forks
	@echo "Waiting for forks to be ready..."
	@sleep 5
	make run

.DEFAULT_GOAL := build 