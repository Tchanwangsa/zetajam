package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"sync"
	"time"

	"zetajam/internal/quiz"
)

const (
	countdown = 3 * time.Second
	// Two correct answers closer together than this is not a human hand.
	minAnswerGap = 120 * time.Millisecond
)

type answer struct {
	i  int
	ms int64
}

type Client struct {
	id   string
	name string
	send chan []byte
	hub  *Hub

	// Everything below is guarded by hub.mu.
	cfg       quiz.Config
	match     *Match
	spectates *Match
	queued    bool
	score     int
	flagged   bool
	answers   []answer
}

type Match struct {
	id      string
	seed    uint32
	cfg     quiz.Config
	a, b    *Client // b is nil for a solo practice run
	specs   map[*Client]bool
	startAt time.Time
	dur     time.Duration
	done    bool
}

type Hub struct {
	mu      sync.Mutex
	clients map[*Client]bool
	queue   []*Client
	matches map[string]*Match
	best    result
	def     quiz.Config // what a client that sends no settings gets
}

func NewHub(dur time.Duration) *Hub {
	def := quiz.Default()
	def.DurSec = int(dur.Seconds())
	return &Hub{
		clients: map[*Client]bool{},
		matches: map[string]*Match{},
		def:     def.Normalize(),
	}
}

func newID() string {
	var b [6]byte
	rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// send never blocks. A client that cannot keep up with a few frames per second
// is gone, and stalling the hub on it would take everyone else down.
func (c *Client) push(m outbound) {
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

// --- registration ---------------------------------------------------------

func (h *Hub) add(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	c.id = newID()
	best := h.best
	h.mu.Unlock()

	msg := outbound{T: "welcome", Self: &playerInfo{ID: c.id}}
	if best.Score > 0 {
		msg.Best = &best
	}
	c.push(msg)
	h.broadcastPresence()
	h.broadcastGames()
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.dequeueLocked(c)
	if m := c.spectates; m != nil {
		delete(m.specs, c)
		c.spectates = nil
	}
	m := c.match
	h.mu.Unlock()

	if m != nil {
		h.finish(m, c) // a disconnect ends the match for the other side too
	}
	h.broadcastPresence()
	h.broadcastGames()
}

// --- matchmaking ----------------------------------------------------------

func (h *Hub) join(c *Client, name string, solo bool, cfg *quiz.Config) {
	if name == "" {
		name = "guest"
	}
	if len(name) > 20 {
		name = name[:20]
	}
	conf := h.def
	if cfg != nil {
		conf = cfg.Normalize()
	}

	h.mu.Lock()
	c.name = name
	c.cfg = conf
	c.score, c.flagged, c.answers = 0, false, nil
	if c.match != nil || c.queued {
		h.mu.Unlock()
		return
	}
	if solo {
		m := h.startMatchLocked(c, nil)
		h.mu.Unlock()
		h.announce(m)
		h.broadcastGames()
		return
	}

	// Only pair players whose settings agree. Adopting one side's config
	// would drop the other into operations or a clock they never chose, and
	// the score would not mean the same thing on both screens.
	sig := conf.Sig()
	var opp *Client
	for i := 0; i < len(h.queue); i++ {
		cand := h.queue[i]
		if !h.clients[cand] || cand.match != nil {
			cand.queued = false
			h.queue = append(h.queue[:i], h.queue[i+1:]...)
			i--
			continue
		}
		if cand.cfg.Sig() == sig {
			cand.queued = false
			h.queue = append(h.queue[:i], h.queue[i+1:]...)
			opp = cand
			break
		}
	}
	if opp == nil {
		c.queued = true
		h.queue = append(h.queue, c)
		h.mu.Unlock()
		c.push(outbound{T: "queued"})
		return
	}
	m := h.startMatchLocked(opp, c)
	h.mu.Unlock()

	h.announce(m)
	h.broadcastGames()
}

func (h *Hub) dequeueLocked(c *Client) {
	if !c.queued {
		return
	}
	c.queued = false
	for i, q := range h.queue {
		if q == c {
			h.queue = append(h.queue[:i], h.queue[i+1:]...)
			return
		}
	}
}

func (h *Hub) startMatchLocked(a, b *Client) *Match {
	var sb [4]byte
	rand.Read(sb[:])
	seed := uint32(sb[0])<<24 | uint32(sb[1])<<16 | uint32(sb[2])<<8 | uint32(sb[3])

	m := &Match{
		id:      newID(),
		seed:    seed,
		cfg:     a.cfg,
		a:       a,
		b:       b,
		specs:   map[*Client]bool{},
		startAt: time.Now().Add(countdown),
		dur:     time.Duration(a.cfg.DurSec) * time.Second,
	}
	a.match, a.score, a.flagged, a.answers = m, 0, false, nil
	if b != nil {
		b.match, b.score, b.flagged, b.answers = m, 0, false, nil
	}
	h.matches[m.id] = m

	// The only thing the server has to wake up for during a match.
	time.AfterFunc(countdown+m.dur+time.Second, func() { h.finish(m, nil) })
	return m
}

func (h *Hub) announce(m *Match) {
	base := outbound{
		T:          "match",
		Seed:       m.seed,
		Cfg:        &m.cfg,
		DurMs:      m.dur.Milliseconds(),
		StartsInMs: time.Until(m.startAt).Milliseconds(),
	}
	for _, c := range []*Client{m.a, m.b} {
		if c == nil {
			continue
		}
		msg := base
		msg.You = &playerInfo{ID: c.id, Name: c.name}
		if o := m.other(c); o != nil {
			msg.Opp = &playerInfo{ID: o.id, Name: o.name}
		}
		c.push(msg)
	}
}

func (m *Match) other(c *Client) *Client {
	if c == m.a {
		return m.b
	}
	return m.a
}

// --- gameplay -------------------------------------------------------------

// onAnswer is the entire hot path. It runs one question() call and one relay.
func (h *Hub) onAnswer(c *Client, in inbound) {
	h.mu.Lock()
	m := c.match
	if m == nil || m.done {
		h.mu.Unlock()
		return
	}
	// Answers must arrive in order, starting at 0. Anything else is a
	// desynced or hand-rolled client.
	if in.I != len(c.answers) {
		h.mu.Unlock()
		return
	}
	// The server holds the seed, so it can check the answer itself. This is
	// what makes the final score authoritative rather than client-reported.
	if quiz.At(m.seed, in.I, m.cfg).Answer != in.V {
		h.mu.Unlock()
		return
	}
	elapsed := time.Since(m.startAt).Milliseconds()
	if in.Ms < -500 || in.Ms > m.dur.Milliseconds()+1000 || in.Ms > elapsed+2000 {
		h.mu.Unlock()
		return
	}
	if n := len(c.answers); n > 0 && in.Ms-c.answers[n-1].ms < minAnswerGap.Milliseconds() {
		c.flagged = true
	}
	c.answers = append(c.answers, answer{i: in.I, ms: in.Ms})
	c.score = len(c.answers)

	msg := outbound{T: "score", ID: c.id, Score: c.score, Ms: in.Ms}
	targets := make([]*Client, 0, len(m.specs)+1)
	if o := m.other(c); o != nil {
		targets = append(targets, o)
	}
	for s := range m.specs {
		targets = append(targets, s)
	}
	h.mu.Unlock()

	for _, t := range targets {
		t.push(msg)
	}
}

// finish ends a match once. leaver, if set, is the client that disconnected.
func (h *Hub) finish(m *Match, leaver *Client) {
	h.mu.Lock()
	if m.done {
		h.mu.Unlock()
		return
	}
	m.done = true
	delete(h.matches, m.id)

	var results []result
	var notify []*Client
	for _, c := range []*Client{m.a, m.b} {
		if c == nil {
			continue
		}
		results = append(results, result{ID: c.id, Name: c.name, Score: c.score, Flagged: c.flagged})
		// Only default-config matches are eligible. A five-minute
		// addition-only run would otherwise own the board forever, and it
		// would not be the same achievement.
		if !c.flagged && c.score > h.best.Score && m.b != nil && m.cfg.Sig() == h.def.Sig() {
			h.best = result{ID: c.id, Name: c.name, Score: c.score}
		}
		c.match = nil
		if c != leaver {
			notify = append(notify, c)
		}
	}
	for s := range m.specs {
		s.spectates = nil
		notify = append(notify, s)
	}
	best := h.best
	h.mu.Unlock()

	msg := outbound{T: "end", Results: results}
	if best.Score > 0 {
		msg.Best = &best
	}
	for _, c := range notify {
		c.push(msg)
	}
	h.broadcastGames()
	h.broadcastPresence()
}

func (h *Hub) spectate(c *Client, id string) {
	h.mu.Lock()
	m := h.matches[id]
	if m == nil || m.done || c.match != nil {
		h.mu.Unlock()
		c.push(outbound{T: "err", Msg: "that game is over"})
		return
	}
	if prev := c.spectates; prev != nil {
		delete(prev.specs, c)
	}
	m.specs[c] = true
	c.spectates = m

	msg := outbound{
		T: "match", Seed: m.seed, Cfg: &m.cfg, DurMs: m.dur.Milliseconds(),
		StartsInMs: time.Until(m.startAt).Milliseconds(),
		Spectating: true,
		You:        &playerInfo{ID: m.a.id, Name: m.a.name},
	}
	if m.b != nil {
		msg.Opp = &playerInfo{ID: m.b.id, Name: m.b.name}
	}
	scores := []outbound{{T: "score", ID: m.a.id, Score: m.a.score}}
	if m.b != nil {
		scores = append(scores, outbound{T: "score", ID: m.b.id, Score: m.b.score})
	}
	h.mu.Unlock()

	c.push(msg)
	for _, s := range scores {
		c.push(s)
	}
}

// --- presence -------------------------------------------------------------

func (h *Hub) broadcastPresence() {
	h.mu.Lock()
	playing := 0
	all := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		all = append(all, c)
		if c.match != nil {
			playing++
		}
	}
	msg := outbound{T: "online", Online: len(all), Playing: playing}
	h.mu.Unlock()

	for _, c := range all {
		c.push(msg)
	}
}

func (h *Hub) broadcastGames() {
	h.mu.Lock()
	games := make([]gameInfo, 0, len(h.matches))
	for _, m := range h.matches {
		if m.b == nil || m.done {
			continue // solo runs are not spectatable
		}
		games = append(games, gameInfo{
			ID: m.id, N1: m.a.name, N2: m.b.name, S1: m.a.score, S2: m.b.score,
		})
	}
	all := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		all = append(all, c)
	}
	msg := outbound{T: "games", Games: games}
	h.mu.Unlock()

	for _, c := range all {
		c.push(msg)
	}
}

func (h *Hub) handle(c *Client, raw []byte) {
	var in inbound
	if err := json.Unmarshal(raw, &in); err != nil {
		log.Printf("bad frame from %s: %v", c.id, err)
		return
	}
	switch in.T {
	case "join":
		h.join(c, in.Name, in.Solo, in.Cfg)
	case "answer":
		h.onAnswer(c, in)
	case "spectate":
		h.spectate(c, in.ID)
	}
}
