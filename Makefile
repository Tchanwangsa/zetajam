BIN := bin/zetajam

.PHONY: dev watch web web-static server run build parity check clean deploy

## dev — two processes: Go on :8080, Vite on :5173 with a /ws proxy.
dev:
	@echo "run these in two terminals:"
	@echo "  make server               # or make watch, to rebuild on save"
	@echo "  cd web && npm run dev     # open http://localhost:5173"

server:
	go run ./server

## watch — make server, but rebuilding whenever a .go file changes. See
## .air.toml for what it watches and why. A rebuild restarts the process, and
## matches and rooms live in that process's memory, so anything in flight is
## gone — reload the page and join again.
##
## air is resolved rather than just invoked: `go install` drops it in
## $(go env GOPATH)/bin, which is not on PATH on a stock macOS shell, so
## assuming the shell can find it fails on the machine that just installed it.
watch:
	@air=$$(command -v air 2>/dev/null); \
	if [ -z "$$air" ]; then \
		dir=$$(go env GOBIN 2>/dev/null); \
		[ -n "$$dir" ] || dir=$$(go env GOPATH 2>/dev/null)/bin; \
		air=$$dir/air; \
	fi; \
	if [ ! -x "$$air" ]; then \
		echo "air not found. install it with:"; \
		echo "    go install github.com/air-verse/air@latest"; \
		echo "(or use 'make server' — same server, no rebuild on save)"; \
		exit 1; \
	fi; \
	exec "$$air"

web:
	cd web && npm run build

## web-static — the frontend on its own, for a static host. Needs VITE_WS_URL
## pointing at the deployed server, because the page will not be same-origin
## with the socket any more.
web-static:
	cd web && npm run build:static

## build — the whole app as one static binary with the frontend inside it.
build: web
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o $(BIN) ./server
	@echo "built $(BIN) ($$(du -h $(BIN) | cut -f1))"

run: build
	./$(BIN)

## parity — the Go and TypeScript question generators must agree exactly, or
## the two sides of a match would be solving different problems.
## Checked under the default config and a custom one, because the settings bar
## means the config is part of what both sides must agree on. The custom case
## deliberately sets only add and mul: sub and div inherit those ranges in
## Normalize, and this proves both mirrors inherit them identically.
CFG := {"ops":["sub","div"],"ranges":{"add":[5,900,1,60],"mul":[3,17,7,250]}}
## The ramp case runs at a length the tier thresholds do not divide evenly, so
## the per-minute scaling has to round identically on both sides or it diverges.
RAMP := {"mode":"ramp","durSec":45,"ranges":{"add":[5,900,1,60],"mul":[3,17,7,250]}}
## Rush changes the rules, not the numbers: it draws from the config's own
## ranges exactly as classic does, so its stream has to come out identical to a
## classic one under the same settings. That is what this case pins down — a
## mode that quietly forked the generator would break every rush room.
RUSH  := {"mode":"rush","durSec":45,"ranges":{"add":[5,900,1,60],"mul":[3,17,7,250]}}
RUSHC := {"durSec":45,"ranges":{"add":[5,900,1,60],"mul":[3,17,7,250]}}

parity:
	@cd web && npx esbuild scripts/parity.ts --bundle --platform=node \
		--format=esm --outfile=/tmp/zj-parity.mjs --log-level=error
	@go run ./cmd/parity 123456789 500 > /tmp/zj-go.txt
	@node /tmp/zj-parity.mjs 123456789 500 > /tmp/zj-ts.txt
	@diff /tmp/zj-go.txt /tmp/zj-ts.txt && echo "parity ok — default"
	@go run ./cmd/parity 987654321 500 '$(CFG)' > /tmp/zj-go2.txt
	@node /tmp/zj-parity.mjs 987654321 500 '$(CFG)' > /tmp/zj-ts2.txt
	@diff /tmp/zj-go2.txt /tmp/zj-ts2.txt && echo "parity ok — custom config"
	@go run ./cmd/parity 555000111 500 '$(RAMP)' > /tmp/zj-go3.txt
	@node /tmp/zj-parity.mjs 555000111 500 '$(RAMP)' > /tmp/zj-ts3.txt
	@diff /tmp/zj-go3.txt /tmp/zj-ts3.txt && echo "parity ok — ramp"
	@go run ./cmd/parity 555000111 500 '$(RUSH)' > /tmp/zj-go4.txt
	@node /tmp/zj-parity.mjs 555000111 500 '$(RUSH)' > /tmp/zj-ts4.txt
	@diff /tmp/zj-go4.txt /tmp/zj-ts4.txt && echo "parity ok — rush"
	@go run ./cmd/parity 555000111 500 '$(RUSHC)' > /tmp/zj-go5.txt
	@diff /tmp/zj-go4.txt /tmp/zj-go5.txt && echo "parity ok — rush is classic's stream"

## check — parity, then vet, then svelte-check. `web` is a prerequisite because
## server/main.go embeds server/dist: on a clean checkout that directory does
## not exist, `go vet ./...` cannot build the package, and the whole target
## fails on a tree that is perfectly fine. Building the frontend first is what
## makes the embed resolvable. The directory is not kept in git with a
## placeholder because Vite empties it on every build and would delete it.
check: parity web
	go vet ./...
	cd web && npm run check

## deploy — Cloud Run. One instance, always warm: matches and rooms live in
## this process's memory, so a second instance means two players can land on
## different machines and never see each other, and a cold start drops every
## open socket. Websockets need the timeout raised from the 5-minute default.
SERVICE ?= zetajam
REGION  ?= australia-southeast1

deploy:
	gcloud run deploy $(SERVICE) \
		--source . \
		--region $(REGION) \
		--allow-unauthenticated \
		--min-instances 1 \
		--max-instances 1 \
		--timeout 3600 \
		--session-affinity \
		$(if $(ORIGINS),--set-env-vars ORIGINS=$(ORIGINS),)

clean:
	# server/dist is generated in full — the bundle, the icons and the crawler
	# files alike — so the directory goes wholesale, rather than a list of its
	# contents that the next asset added would quietly fall off the end of.
	#
	# It comes back holding .gitkeep, because `go:embed all:dist` fails on a
	# missing directory and that would leave `make check` unable to vet the
	# server until somebody built the frontend. A real build empties the
	# directory again, .gitkeep included, and by then there is a bundle in
	# there for embed to find.
	rm -rf bin web/dist server/dist
	mkdir -p server/dist
	touch server/dist/.gitkeep
