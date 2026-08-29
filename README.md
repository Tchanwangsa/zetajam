# zetajam

Mental arithmetic, head to head. A Go server and a Svelte frontend that ship as
one static binary.

```
make server              # Go on :8080
cd web && npm run dev    # Vite on :5173, proxies /ws to :8080
```

`make build` produces `bin/zetajam` with the frontend embedded — one file, no
runtime dependencies.

## Nothing travels per keystroke

The obvious way to build this is to send every keypress to the server and let it
broadcast state. That is what the project this borrows its rules from does, and
it costs about eight messages a second per player, each carrying the full game
state, each triggering a re-render on the other end.

zetajam sends **one frame per correct answer**, about 40 bytes:

```json
{"t":"answer","i":17,"v":74,"ms":9421}
```

A measured 8-second match is 872 bytes uplink for 22 answers. A full 120-second
match is a couple of kilobytes.

That works because of how questions are generated.

## Questions are a pure function, not a stream

`question(seed, i, cfg)` seeds a fresh xorshift32 from `mix32(seed ^ mix32(i+1))`
and reads three values off it — one to pick the operation, two for the operands.
It depends on nothing but its arguments, so:

- The server sends **one seed and one config** at match start and then never
  sends a question.
- Both players generate an identical stream locally, at zero latency.
- The server can check answer `i` in isolation, without replaying `0..i-1`.

The generator exists twice — `internal/quiz/` in Go, `web/src/lib/` in
TypeScript — and the two must agree bit for bit or the players would be solving
different problems. `make parity` diffs 500 questions across both and fails if
they diverge. Change one, change the other.

## Who decides the score

The client checks your answer locally so typing feels instant, but it does not
get to report its own score. Since the server holds the seed it re-derives the
expected answer for every frame it receives and only counts the ones that match,
in order, starting from zero. A client that sends 50 answers with wrong values
finishes on 0. Correct answers arriving closer than 120ms apart are `flagged` —
that is not a human hand.

So: client-authoritative *feel*, server-authoritative *truth*.

## Settings ride along with the join

The gear in the header opens a panel: four operator tabs you can switch on and
off, a caret on each that pops out that operation's two operand ranges, and a
clock. The `↻` beside it restarts a solo run under whatever is currently set.

Because the server re-derives every answer, settings cannot be a client-side
preference — a config the server did not know about would fail verification on
every frame and everyone would finish on zero. So the config travels with the
join, the server normalizes it once (canonical operation order, no inverted
range, no zero divisor, 10s–600s), and sends the normalized copy back in the
match frame. **That echoed copy is what both clients generate from**, not their
own, so the two sides cannot disagree even if one of them is lying.

Two consequences fall out of that:

- **Matchmaking pairs on identical settings.** Adopting one side's config would
  drop the other into operations or a clock they never chose. `Config.Sig()` is
  the queue key.
- **The daily best only counts default-config matches.** A five-minute
  addition-only run would otherwise own the board forever, and it is not the
  same achievement.

`make parity` now diffs the two generators under a custom config as well as the
default one — the config is part of what the mirror has to agree on.

## The graph does not twitch

Four rules, each killing a different source of jitter:

1. **Sampled on a fixed 1Hz clock**, never on a network event. The old version
   redrew on every opponent keystroke, so the line danced to their typing.
2. **Fixed x domain** of `0..duration`. It cannot rescale because it never grows.
3. **Ratcheted y domain** — steps of 20, monotonically non-decreasing for the
   life of a run. An axis that never shrinks never snaps back.
4. **Monotone cubic interpolation** (Fritsch–Carlson, so it cannot overshoot)
   over an EMA-smoothed trailing-window rate.

Two lines per player: a solid one for the trailing 6-second rate, a dashed one
for the cumulative average. It is hand-rolled SVG in `Graph.svelte` — for 120
points a charting library is 60KB you do not need.

## Layout

```
internal/quiz/     question generator + config (Go side of the mirror)
server/            websocket hub, matchmaking, verification, static serving
  hub.go             one mutex, one match map; onAnswer is the whole hot path
  main.go            embeds server/dist, serves it, upgrades /ws
web/src/lib/       rng, questions + config (TS side of the mirror), net, graph math
web/src/components/
cmd/parity/        prints a question stream for the parity diff
```

## Deploying

WebSockets are long-lived and matches live in one process's memory, so this
wants a real box, not a serverless function. `fly deploy` works out of the tin;
so does the Dockerfile anywhere else.

Keep it to **one machine** unless you add shared matchmaking — two instances
behind a load balancer means two players can land on different processes and
never see each other.

## Known edges

- Spectators see scores and pace, not the opponent's screen. Streaming their
  keystrokes is exactly the thing this design removed.
- The high score is in memory and dies with the process.
- Verification proves an answer was *correct*, not that a human produced it. The
  120ms gap check is a speed bump, not a wall — the real fix is a signed match
  token, which is more than this needs.
