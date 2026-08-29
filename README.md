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
match is a couple of kilobytes. A room of eight costs the server eight of those
to relay, not sixty-four per second.

That works because of how questions are generated.

## Questions are a pure function, not a stream

`question(seed, i, cfg)` seeds a fresh xorshift32 from `mix32(seed ^ mix32(i+1))`
and reads three values off it — one to pick the operation, two for the operands.
It depends on nothing but its arguments, so:

- The server sends **one seed and one config** at match start and then never
  sends a question.
- Every player generates an identical stream locally, at zero latency.
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

## Two ranges, not four

Subtraction is an addition read backwards — `a + b` asked as `(a+b) − a` — and
division is a multiplication read backwards. That is what keeps every answer a
clean positive integer, and it means only two of the four operations have a
range worth setting.

`Normalize` is where that becomes true rather than merely displayed: it copies
`add`'s range onto `sub` and `mul`'s onto `div`, on the server, once. A
hand-rolled client cannot send four independent ranges and end up generating a
stream nobody agreed to. `make parity` checks the custom-config case with only
`add` and `mul` set, so both mirrors have to inherit identically.

## Settings ride along with the join

The settings are a bar across the top of every screen, not a panel you open and
close: four operator toggles, four length presets plus a custom seconds box, and
a `ranges` popover. Changing one mid-run restarts a solo run under it and
re-enters the queue on the new signature — you find out a setting is wrong by
playing under it, and having to stop to change it is how a setting stays wrong.

Because the server re-derives every answer, settings cannot be a client-side
preference — a config the server did not know about would fail verification on
every frame and everyone would finish on zero. So the config travels with the
join, the server normalizes it once (canonical operation order, no inverted
range, no zero divisor, 10s–600s), and sends the normalized copy back in the
match frame. **That echoed copy is what every client generates from**, not their
own, so no two sides can disagree even if one of them is lying.

Two consequences fall out of that:

- **Matchmaking pairs on identical settings.** Adopting one side's config would
  drop the other into operations or a clock they never chose. `Config.Sig()` is
  the queue key.
- **The daily best only counts default-config open matches.** A five-minute
  addition-only run would otherwise own the board forever, and a private room is
  its own scoreboard.

The bar is read-only in the two places where changing it would be unfair to
somebody else: a versus match already in progress, and a room you are not the
host of.

## Rooms

`room.create` mints a four-character code from an alphabet with no `I`, `O`, `0`
or `1` in it, because a code gets read out loud. `zetajam.app/r/QK4M` opens
straight onto the join screen with the code filled in; `?room=QK4M` does the same
for a static host with no rewrite rule.

The host owns the room: the settings, who is in it, and when it starts. Everyone
else sees the same screen with the controls off, so nobody has to be told what
changed. A room outlives the matches played in it — the group can run again
without swapping codes — and if the host leaves, the role passes to whoever is
next in the roster rather than closing the room out from under everybody.

A `Match` holds `players []*Client`, one entry for a solo run and up to eight for
a room. Nothing downstream branches on the count: a `score` frame carries the id
it belongs to and each client keeps its own table.

## The graph does not twitch

The y axis is **cumulative answers** — the number on the scoreboard, plotted.
That choice does most of the anti-jitter work by itself: a running total is
monotonic, so the peak only ever grows, so the axis only ever grows, so it can
never snap back. What is left is two rules:

1. **Sampled on a fixed 1Hz clock**, never on a network event. The old version
   redrew on every opponent keystroke, so the line danced to their typing.
2. **Fixed x domain** of `0..duration`. It cannot rescale because it never grows.

The lines are drawn straight, point to point. An earlier version plotted a rate,
which needed a trailing-window EMA and monotone cubic interpolation to read as a
trend rather than a staircase; a step count needs neither, because the steps are
the information. Axis steps are forced to whole numbers — nobody has given two
and a half answers.

One line per player, coloured in roster order. You are always the accent and
always drawn last, so your line is never buried under somebody else's, and a
colour means the same person on every screen in the room. Hand-rolled SVG in
`Graph.svelte` — for a couple of hundred points a charting library is 60KB you
do not need.

## Layout

```
internal/quiz/     question generator + config (Go side of the mirror)
server/            websocket hub, matchmaking, rooms, verification, static serving
  hub.go             one mutex, one match map, one room map; onAnswer is the hot path
  main.go            embeds server/dist, serves it, upgrades /ws
web/src/lib/       rng, questions + config (TS side of the mirror), net, rooms,
                   player colours, graph maths
web/src/components/
  ui/                the bits used in more than one place — NumField, Popover
web/src/app.css    tokens plus the shared button/field/surface classes
cmd/parity/        prints a question stream for the parity diff
```

Component styles are scoped by Svelte, which is right for layout and wrong for a
design system, so anything that appeared in more than one component — buttons,
text fields, the panel surface — lives in `app.css` instead.

## Deploying

Websockets are long-lived and matches live in one process's memory, so this
wants something that will hold a connection open.

**Cloud Run** is the target. `make deploy` wraps the incantation:

```
make deploy ORIGINS=https://zetajam.pages.dev
```

The flags that matter: `--min-instances 1 --max-instances 1` because a second
instance means two players land on different machines and never see each other,
and a cold start drops every open socket; `--timeout 3600` because the default
five minutes would cut a websocket off mid-match.

Lambda cannot run this as it stands. Its websocket story is API Gateway, which
holds no connection state of its own — the hub, every match and every room would
have to move into DynamoDB and `push` would become an HTTP call per frame. That
is a different program, not a deployment setting.

Two things that will waste an afternoon if nobody writes them down:

- **`/healthz` is reserved.** Google's edge answers it with its own 404 on
  `*.run.app` before the request reaches the container, so a health check on
  that path looks like a dead service when the service is fine. The endpoint
  here is `/health`.
- **`status.url` is not the whole story.** `gcloud run services describe` may
  report the legacy `SERVICE-HASH-REGION.a.run.app` hostname while the deploy
  prints the current `SERVICE-PROJECTNUMBER.REGION.run.app` one. Both route to
  the same service; the second is the one to hand out.

**The page can be hosted separately** — Vercel or Cloudflare Pages — with only
the socket on Cloud Run:

```
cd web && VITE_WS_URL=https://zetajam-xxxx.a.run.app npm run build:static
```

Then set `ORIGINS` on the server to the page's origin. A websocket upgrade from
another origin is not covered by CORS and the browser will not stop it, so the
server checks `Origin` itself; same-origin and localhost are always allowed.
`web/vercel.json` and `web/public/_redirects` carry the rewrite that keeps
`/r/QK4M` from 404ing.

## Known edges

- **No database.** The hub, the rooms and the day's best are all in memory and
  die with the process. Nothing needs persisting yet; when the best score does,
  Firestore is the least-friction option on Cloud Run — a container has no disk
  worth writing to, so SQLite would not survive a redeploy.
- Spectators see scores and pace, not anyone's screen. Streaming keystrokes is
  exactly the thing this design removed.
- Verification proves an answer was *correct*, not that a human produced it. The
  120ms gap check is a speed bump, not a wall — the real fix is a signed match
  token, which is more than this needs.
