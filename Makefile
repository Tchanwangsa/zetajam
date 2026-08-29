BIN := bin/zetajam

.PHONY: dev web server run build parity check clean

## dev — two processes: Go on :8080, Vite on :5173 with a /ws proxy.
dev:
	@echo "run these in two terminals:"
	@echo "  make server"
	@echo "  cd web && npm run dev     # open http://localhost:5173"

server:
	go run ./server

web:
	cd web && npm run build

## build — the whole app as one static binary with the frontend inside it.
build: web
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o $(BIN) ./server
	@echo "built $(BIN) ($$(du -h $(BIN) | cut -f1))"

run: build
	./$(BIN)

## parity — the Go and TypeScript question generators must agree exactly, or
## the two sides of a match would be solving different problems.
## Checked under the default config and a custom one, because the settings
## panel means the config is now part of what both sides must agree on.
CFG := {"ops":["sub","div"],"ranges":{"sub":[5,900,1,60],"div":[3,17,7,250]}}

parity:
	@cd web && npx esbuild scripts/parity.ts --bundle --platform=node \
		--format=esm --outfile=/tmp/zj-parity.mjs --log-level=error
	@go run ./cmd/parity 123456789 500 > /tmp/zj-go.txt
	@node /tmp/zj-parity.mjs 123456789 500 > /tmp/zj-ts.txt
	@diff /tmp/zj-go.txt /tmp/zj-ts.txt && echo "parity ok — default"
	@go run ./cmd/parity 987654321 500 '$(CFG)' > /tmp/zj-go2.txt
	@node /tmp/zj-parity.mjs 987654321 500 '$(CFG)' > /tmp/zj-ts2.txt
	@diff /tmp/zj-go2.txt /tmp/zj-ts2.txt && echo "parity ok — custom config"

check: parity
	go vet ./...
	cd web && npm run check

clean:
	rm -rf bin server/dist/assets server/dist/index.html
