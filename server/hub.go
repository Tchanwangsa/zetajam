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
	maxRoomSize  = 8
	// Ambiguous glyphs are left out: a code gets read down a phone line.
	codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	codeLen      = 4
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
	room      *Room
	spectates *Match
	queued    bool
	score     int
	flagged   bool
	answers   []answer
}

// Match is one run of the clock. players is one entry for a solo run, two for
// a matchmade duel, and up to maxRoomSize for a room — the code below never
// branches on which, because a score frame carries the id it belongs to and
// the client keeps its own table.
type Match struct {
	id      string
	seed    uint32
	cfg     quiz.Config
	players []*Client
	room    *Room // nil unless the match was started from a room
	specs   map[*Client]bool
	startAt time.Time
	dur     time.Duration
	done    bool
}

// Room is a private lobby. It outlives the matches played in it, so a group
// can run again without swapping codes.
type Room struct {
	code    string
	host    *Client
	members []*Client
	cfg     quiz.Config
	match   *Match
}

type Hub struct {
	mu      sync.Mutex
	clients map[*Client]bool
	queue   []*Client
	matches map[string]*Match
	rooms   map[string]*Room
	best    result
	def     quiz.Config // what a client that sends no settings gets
}

func NewHub(dur time.Duration) *Hub {
	def := quiz.Default()
	def.DurSec = int(dur.Seconds())
	return &Hub{
		clients: map[*Client]bool{},
		matches: map[string]*Match{},
		rooms:   map[string]*Room{},
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

func pushAll(cs []*Client, m outbound) {
	for _, c := range cs {
		if c != nil {
			c.push(m)
		}
	}
}

// --- registration ---------------------------------------------------------

func (h *Hub) add(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	c.id = newID()
	c.cfg = h.def
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
	room, roomFrame, gone := h.leaveRoomLocked(c)
	h.mu.Unlock()

	if m != nil {
		h.finish(m, c) // a disconnect ends the match for everyone else too
	}
	if room != nil {
		pushAll(gone, roomFrame)
	}
	h.broadcastPresence()
	h.broadcastGames()
}

// --- matchmaking ----------------------------------------------------------

func (h *Hub) join(c *Client, name string, solo bool, cfg *quiz.Config) {
	conf := h.def
	if cfg != nil {
		conf = cfg.Normalize()
	}

	// Restarting is the common case for `join`, not the rare one: the ↻ button
	// and the results screen both land here while the previous run may still be
	// open. A solo run is yours alone, so end it and start again. A run with
	// other people in it is not, so leave it be.
	h.mu.Lock()
	h.dequeueLocked(c)
	prev := c.match
	h.mu.Unlock()
	if prev != nil {
		if len(prev.players) > 1 {
			return
		}
		h.finish(prev, c) // clears c.match; c is the leaver, so it gets no `end`
	}

	if name == "" {
		name = "guest"
	}
	if len(name) > 20 {
		name = name[:20]
	}

	h.mu.Lock()
	c.name = name
	c.cfg = conf
	c.score, c.flagged, c.answers = 0, false, nil
	if c.match != nil {
		h.mu.Unlock()
		return
	}
	if solo {
		m := h.startMatchLocked([]*Client{c}, conf, nil)
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
	m := h.startMatchLocked([]*Client{opp, c}, conf, nil)
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

func (h *Hub) startMatchLocked(players []*Client, cfg quiz.Config, room *Room) *Match {
	var sb [4]byte
	rand.Read(sb[:])
	seed := uint32(sb[0])<<24 | uint32(sb[1])<<16 | uint32(sb[2])<<8 | uint32(sb[3])

	m := &Match{
		id:      newID(),
		seed:    seed,
		cfg:     cfg,
		players: players,
		room:    room,
		specs:   map[*Client]bool{},
		startAt: time.Now().Add(countdown),
		dur:     time.Duration(cfg.DurSec) * time.Second,
	}
	for _, c := range players {
		c.match, c.score, c.flagged, c.answers = m, 0, false, nil
	}
	h.matches[m.id] = m
	if room != nil {
		room.match = m
	}

	// The only thing the server has to wake up for during a match.
	time.AfterFunc(countdown+m.dur+time.Second, func() { h.finish(m, nil) })
	return m
}

func (h *Hub) announce(m *Match) {
	roster := make([]playerInfo, 0, len(m.players))
	for _, c := range m.players {
		roster = append(roster, playerInfo{ID: c.id, Name: c.name})
	}
	base := outbound{
		T:          "match",
		Seed:       m.seed,
		Cfg:        &m.cfg,
		DurMs:      m.dur.Milliseconds(),
		StartsInMs: time.Until(m.startAt).Milliseconds(),
		Players:    roster,
	}
	for _, c := range m.players {
		msg := base
		msg.You = &playerInfo{ID: c.id, Name: c.name}
		c.push(msg)
	}
}

// --- rooms ----------------------------------------------------------------

func (h *Hub) newCodeLocked() string {
	for {
		var b [codeLen]byte
		rand.Read(b[:])
		code := make([]byte, codeLen)
		for i := range code {
			code[i] = codeAlphabet[int(b[i])%len(codeAlphabet)]
		}
		if _, taken := h.rooms[string(code)]; !taken {
			return string(code)
		}
	}
}

// roomFrameLocked snapshots a room into the frame everyone in it gets, plus
// the list to send it to. Built under the lock, sent outside it.
func (h *Hub) roomFrameLocked(r *Room) (outbound, []*Client) {
	members := make([]playerInfo, 0, len(r.members))
	for _, c := range r.members {
		members = append(members, playerInfo{ID: c.id, Name: c.name})
	}
	cfg := r.cfg
	info := &roomInfo{Code: r.code, Members: members, Cfg: &cfg}
	if r.host != nil {
		info.HostID = r.host.id
	}
	return outbound{T: "room", Room: info}, append([]*Client(nil), r.members...)
}

// leaveRoomLocked takes c out of whatever room it is in and returns the room,
// the frame the remaining members need, and who to send it to. The room is
// dropped when the last member goes; the host role passes to whoever is next.
func (h *Hub) leaveRoomLocked(c *Client) (*Room, outbound, []*Client) {
	r := c.room
	if r == nil {
		return nil, outbound{}, nil
	}
	c.room = nil
	for i, m := range r.members {
		if m == c {
			r.members = append(r.members[:i], r.members[i+1:]...)
			break
		}
	}
	if len(r.members) == 0 {
		delete(h.rooms, r.code)
		return r, outbound{}, nil
	}
	if r.host == c {
		r.host = r.members[0]
	}
	frame, to := h.roomFrameLocked(r)
	return r, frame, to
}

func clampName(name string) string {
	if name == "" {
		return "guest"
	}
	if len(name) > 20 {
		return name[:20]
	}
	return name
}

func (h *Hub) roomCreate(c *Client, name string, cfg *quiz.Config) {
	conf := h.def
	if cfg != nil {
		conf = cfg.Normalize()
	}

	h.mu.Lock()
	h.dequeueLocked(c)
	_, oldFrame, oldTo := h.leaveRoomLocked(c)
	c.name = clampName(name)
	c.cfg = conf

	r := &Room{code: h.newCodeLocked(), host: c, members: []*Client{c}, cfg: conf}
	h.rooms[r.code] = r
	c.room = r
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()

	pushAll(oldTo, oldFrame)
	pushAll(to, frame)
}

func (h *Hub) roomJoin(c *Client, code, name string) {
	h.mu.Lock()
	r := h.rooms[code]
	if r == nil {
		h.mu.Unlock()
		c.push(outbound{T: "room.gone", Msg: "no room with that code"})
		return
	}
	if r.match != nil && !r.match.done {
		h.mu.Unlock()
		c.push(outbound{T: "room.gone", Msg: "that room is mid-run — try again in a minute"})
		return
	}
	if len(r.members) >= maxRoomSize {
		h.mu.Unlock()
		c.push(outbound{T: "room.gone", Msg: "that room is full"})
		return
	}
	if c.room == r {
		frame, to := h.roomFrameLocked(r)
		h.mu.Unlock()
		pushAll(to, frame)
		return
	}
	h.dequeueLocked(c)
	_, oldFrame, oldTo := h.leaveRoomLocked(c)
	c.name = clampName(name)
	c.room = r
	c.cfg = r.cfg
	r.members = append(r.members, c)
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()

	pushAll(oldTo, oldFrame)
	pushAll(to, frame)
}

func (h *Hub) roomLeave(c *Client) {
	h.mu.Lock()
	_, frame, to := h.leaveRoomLocked(c)
	h.mu.Unlock()
	pushAll(to, frame)
}

func (h *Hub) roomCfg(c *Client, cfg *quiz.Config) {
	if cfg == nil {
		return
	}
	conf := cfg.Normalize()

	h.mu.Lock()
	r := c.room
	if r == nil || r.host != c {
		h.mu.Unlock()
		return
	}
	r.cfg = conf
	for _, m := range r.members {
		m.cfg = conf
	}
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()
	pushAll(to, frame)
}

func (h *Hub) roomKick(c *Client, id string) {
	h.mu.Lock()
	r := c.room
	if r == nil || r.host != c {
		h.mu.Unlock()
		return
	}
	var target *Client
	for _, m := range r.members {
		if m.id == id && m != c {
			target = m
			break
		}
	}
	if target == nil {
		h.mu.Unlock()
		return
	}
	_, frame, to := h.leaveRoomLocked(target)
	h.mu.Unlock()

	target.push(outbound{T: "room.gone", Msg: "the host removed you from the room"})
	pushAll(to, frame)
}

// endStaleSolo closes any solo run still open on a member of c's room. Each is
// finished with its own player as the leaver: they left that run the moment
// they walked into the room, and an `end` frame now would only bounce them onto
// a results screen for it. Reports whether c is still hosting a room worth
// starting — finish() releases the lock, so nothing survives the call.
func (h *Hub) endStaleSolo(c *Client) bool {
	h.mu.Lock()
	r := c.room
	if r == nil || r.host != c {
		h.mu.Unlock()
		return false
	}
	var stale []*Match
	for _, m := range r.members {
		if m.match != nil && !m.match.done && m.match.room == nil && len(m.match.players) == 1 {
			stale = append(stale, m.match)
		}
	}
	h.mu.Unlock()

	for _, m := range stale {
		h.finish(m, m.players[0])
	}
	return true
}

func (h *Hub) roomStart(c *Client) {
	// Walking out of a solo run does not tell the server anything, so a member
	// who wandered off one and into this room still owns it for the rest of its
	// clock. End those first, on the same terms `join` does — a solo run is
	// yours alone, so starting something else ends it. Skipping them instead
	// leaves them sitting on the room screen while everyone else plays.
	if !h.endStaleSolo(c) {
		return
	}

	h.mu.Lock()
	r := c.room
	if r == nil || r.host != c {
		h.mu.Unlock()
		return
	}
	if r.match != nil && !r.match.done {
		h.mu.Unlock()
		return
	}
	players := make([]*Client, 0, len(r.members))
	for _, m := range r.members {
		if m.match == nil {
			players = append(players, m)
		}
	}
	if len(players) == 0 {
		h.mu.Unlock()
		return
	}
	m := h.startMatchLocked(players, r.cfg, r)
	h.mu.Unlock()

	h.announce(m)
	h.broadcastGames()
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
	targets := make([]*Client, 0, len(m.players)+len(m.specs))
	for _, o := range m.players {
		if o != c {
			targets = append(targets, o)
		}
	}
	for s := range m.specs {
		targets = append(targets, s)
	}
	h.mu.Unlock()

	pushAll(targets, msg)
}

// finish ends a match once. leaver, if set, is the client that walked away and
// therefore does not need telling.
func (h *Hub) finish(m *Match, leaver *Client) {
	h.mu.Lock()
	if m.done {
		h.mu.Unlock()
		return
	}
	m.done = true
	delete(h.matches, m.id)
	if m.room != nil && m.room.match == m {
		m.room.match = nil
	}

	results := make([]result, 0, len(m.players))
	var notify []*Client
	// A private room is its own scoreboard; only open matchmaking, on the
	// standard settings, gets to touch the day's best.
	eligible := m.room == nil && len(m.players) > 1 && m.cfg.Sig() == h.def.Sig()
	for _, c := range m.players {
		results = append(results, result{ID: c.id, Name: c.name, Score: c.score, Flagged: c.flagged})
		if eligible && !c.flagged && c.score > h.best.Score {
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
	var roomFrame outbound
	var roomTo []*Client
	if m.room != nil {
		roomFrame, roomTo = h.roomFrameLocked(m.room)
	}
	h.mu.Unlock()

	msg := outbound{T: "end", Results: results}
	if best.Score > 0 {
		msg.Best = &best
	}
	pushAll(notify, msg)
	pushAll(roomTo, roomFrame)
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

	roster := make([]playerInfo, 0, len(m.players))
	scores := make([]outbound, 0, len(m.players))
	for _, p := range m.players {
		roster = append(roster, playerInfo{ID: p.id, Name: p.name})
		scores = append(scores, outbound{T: "score", ID: p.id, Score: p.score})
	}
	cfg := m.cfg
	msg := outbound{
		T: "match", Seed: m.seed, Cfg: &cfg, DurMs: m.dur.Milliseconds(),
		StartsInMs: time.Until(m.startAt).Milliseconds(),
		Spectating: true,
		Players:    roster,
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

	pushAll(all, msg)
}

func (h *Hub) broadcastGames() {
	h.mu.Lock()
	games := make([]gameInfo, 0, len(h.matches))
	for _, m := range h.matches {
		if len(m.players) < 2 || m.done {
			continue // solo runs are not spectatable
		}
		g := gameInfo{ID: m.id}
		for _, p := range m.players {
			g.Names = append(g.Names, p.name)
			g.Scores = append(g.Scores, p.score)
		}
		games = append(games, g)
	}
	all := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		all = append(all, c)
	}
	msg := outbound{T: "games", Games: games}
	h.mu.Unlock()

	pushAll(all, msg)
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
	case "room.create":
		h.roomCreate(c, in.Name, in.Cfg)
	case "room.join":
		h.roomJoin(c, in.Code, in.Name)
	case "room.leave":
		h.roomLeave(c)
	case "room.cfg":
		h.roomCfg(c, in.Cfg)
	case "room.kick":
		h.roomKick(c, in.ID)
	case "room.start":
		h.roomStart(c)
	}
}
