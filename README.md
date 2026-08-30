# zetajam

Mental arithmetic, head to head. A Go websocket server and a Svelte frontend
that build into one static binary.

- **Solo runs** against the clock, or **rooms** of up to eight — public and
  listed, or private behind a four-character code.
- **Classic or ramp** — fixed difficulty, or a run that opens easy and climbs.
- Configurable operations, term ranges and length; a live graph of everybody's
  pace, with a per-question breakdown of your own.

## Run it

```bash
make server                # Go on :8080
cd web && pnpm dev         # Vite on :5173, proxies /ws to :8080
```

`make build` produces `bin/zetajam` — the frontend embedded in the binary, no
runtime dependencies. `make check` runs the parity diff, `go vet` and
`svelte-check`.

## How it works

**Questions are a pure function, not a stream.** `question(seed, i, cfg)`
derives question `i` from the seed alone. The server sends one seed and one
config at match start and never sends a question: every client generates the
same stream locally at zero latency, and the server can verify answer `i`
without replaying the ones before it.

**One frame per correct answer**, about 40 bytes:

```json
{"t":"answer","i":17,"v":74,"ms":9421}
```

Not one per keystroke. A two-minute match is a couple of kilobytes uplink, and
a room of eight costs the server eight relays rather than sixty-four a second.

**The server decides the score.** The client checks your answer locally so
typing feels instant, but it does not report its own score — the server
re-derives the expected answer for every frame and counts only the ones that
match, in order. Answers arriving closer than 120ms apart are flagged.

**The generator exists twice** — `internal/quiz/` in Go, `web/src/lib/` in
TypeScript — and the two must agree bit for bit. `make parity` diffs 500
questions across both under three configs and fails if they diverge. Change
one, change the other.

**Settings travel with the join.** The server normalizes the config once
(canonical operation order, no inverted range, 10s–600s) and echoes the
normalized copy back; every client generates from that copy, not its own, so no
two sides can disagree even if one is lying. Subtraction and division are
generated as inverted addition and multiplication, which is what keeps every
answer a clean positive integer — and why only two of the four operations have
a range worth setting.

**The graph plots cumulative answers**, sampled on a fixed 1Hz clock rather
than on network events, over a fixed `0..duration` x domain. A running total is
monotonic, so the axis only ever grows and the line cannot snap back while
somebody else is typing.

## Layout

```
internal/quiz/          question generator + config (Go side of the mirror)
server/                 websocket hub, matchmaking, rooms, verification, static serving
web/src/lib/            rng, questions + config (TS side of the mirror), net, graph maths
web/src/components/     screens; ui/ is the parts used in more than one of them
web/src/app.css         tokens and the shared button/field/surface classes
cmd/parity/             prints a question stream for the parity diff
```

## Deploy

Websockets are long-lived and matches live in one process's memory, so this
needs a host that holds connections open and runs a **single instance** — a
second instance puts two players on different machines where they never see
each other.

Cloud Run is one such host, and `make deploy` wraps it:

```bash
make deploy SERVICE=your-service REGION=your-region
```

The flags that matter are `--min-instances 1 --max-instances 1` (one warm
process) and `--timeout 3600` (the default five minutes would cut a websocket
off mid-match). Anything comparable works — a VM, Fly, Render, a container
anywhere. API-Gateway-style websockets do not, without moving the hub into a
database first.

The health endpoint is `/health`.

### Frontend on a separate host

Optional. Build the page against the deployed server and host it anywhere
static:

```bash
cd web && VITE_WS_URL=https://your-server pnpm build:static
```

Then set `ORIGINS` on the server to the page's origin — a websocket upgrade
from another origin is not covered by CORS, so the server checks `Origin`
itself. Same-origin and localhost are always allowed. `web/vercel.json` and
`web/public/_redirects` carry the rewrite that keeps `/r/CODE` links from
404ing.

### CI

`.github/workflows/ci.yml` runs the checks on every push and pull request, and
on `main`/`master` deploys the server and then the page — in that order, since
an old page against a new server is survivable and the reverse is not. The
deploy jobs need host credentials as repository secrets and variables — the
comments in the workflow say which, and the jobs are the first thing to drop if
you would rather deploy by hand.
