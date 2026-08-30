package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"sort"
	"sync"
	"time"

	"zetajam/internal/quiz"
)

const (
	countdown = 3 * time.Second
	// Two correct answers closer together than this is not a human hand.
	minAnswerGap = 120 * time.Millisecond
	// How far past the end of a rush slot a buzz for it is still taken. The
	// slot boundary is on the match clock, which every client keeps for itself,
	// so a frame typed at 4.98s only reaches here after a trip up the wire —
	// judging it by arrival alone would rob whoever answered latest and fastest.
	rushGrace   = 750 * time.Millisecond
	maxRoomSize = 8
	// How many finished runs a room remembers. Long enough that an evening
	// reads back whole, short enough that the room frame — which goes out in
	// full every time anyone joins, leaves or changes a setting — stays a
	// thing you can send on every keystroke without thinking about it.
	roomLogMax = 12
	// How long a room may sit with nothing happening in it before it is
	// closed. Not a tidiness measure: a member of a room is the one client
	// the browser will not put its socket to sleep, because closing the
	// socket is exactly how you leave a room — see Hub.remove and sleep() in
	// web/src/lib/net.ts. So an abandoned room is an open socket for as long
	// as the tab lives, and this server is billed by the second one is open.
	// Anything happening in the room pushes this back out; a run in progress
	// is exempt however long it takes.
	roomIdle = 15 * time.Minute
	// How long a client may hold a socket open having said nothing and having
	// nothing held for it. The browser puts its own socket down long before
	// this — see sleep() in web/src/lib/net.ts — so this is the backstop for
	// the tabs that cannot: a backgrounded phone browser freezes timers
	// outright, and a socket nothing will ever close again is billed for as
	// long as the tab lives.
	clientIdle = 10 * time.Minute
	// The close code for that, which means "you were idle — do not come back
	// on your own". A plain close is a network blip as far as the browser is
	// concerned, and Net reconnects out of one within the second.
	closeIdle = 4001
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
	// Closed once, by doze, to bring this socket down from our side.
	quit chan struct{}

	// Everything below is guarded by hub.mu.
	seen      time.Time // when this client last said anything
	cfg       quiz.Config
	match     *Match
	room      *Room
	spectates *Match
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

	// Rush only: who took each slot. A slot appears here the moment the first
	// valid buzz for it arrives and is never overwritten, which is the whole of
	// the rule — one point per question, to whoever got here first, or to
	// nobody at all. Nil in every other mode. Guarded by hub.mu, like
	// everything else on a Match.
	claims map[int]*Client

	// Rush only: the schedule, pinned at the last slot a claim moved. Slots no
	// longer sit on fixed five-second boundaries — a slot ends when somebody
	// takes it — so the server cannot derive a slot's window from its index
	// alone. It carries the fold instead: rushSlot opened at rushAt, and every
	// slot after it opens a full RushMs later until a claim pulls the schedule
	// forward again. See quiz.RushNext, which every client runs too.
	rushSlot int
	rushAt   int64
}

// rushStart is the millisecond into the run at which slot `i` opens, as far as
// this match knows. Exact for the live slot and every slot after it, which is
// the only range a buzz is ever judged against: a slot behind the pin is
// either already claimed — and refused before this is reached — or long gone,
// and reads early here, which refuses it too.
func (m *Match) rushStart(i int) int64 {
	return m.rushAt + int64(i-m.rushSlot)*quiz.RushMs
}

// Room is a lobby. It outlives the matches played in it, so a group can run
// again without swapping codes.
//
// public is the only difference between "find a match" and "play with
// friends": a public room is listed for anyone to walk into, a private one is
// reachable only by its code. Either way the host owns the settings and says
// when the run starts, so there is one screen and one set of rules for both.
type Room struct {
	code    string
	host    *Client
	members []*Client
	cfg     quiz.Config
	match   *Match
	public  bool
	// Every run finished in this room, oldest first, capped at roomLogMax.
	// This is the whole of the room's memory: it is born when the room is and
	// dies with it, like everything else in here.
	log []roomGame
	// When something last happened in here. Stamped by roomFrameLocked, read
	// by reapRooms.
	touched time.Time
}

type Hub struct {
	mu      sync.Mutex
	clients map[*Client]bool
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

// doze brings a client's socket down from our side, once. writePump sees the
// channel close and sends the idle code; readPump then unwinds into Hub.remove
// like any other disconnect, so there is no second teardown path to keep in
// step with the first. Callers hold hub.mu.
func doze(c *Client) {
	select {
	case <-c.quit:
	default:
		close(c.quit)
	}
}

// --- registration ---------------------------------------------------------

func (h *Hub) add(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	c.id = newID()
	c.seen = time.Now()
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
	h.broadcastRooms()
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.unwatchLocked(c)
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
	h.broadcastRooms()
}

// --- solo runs ------------------------------------------------------------

// solo starts a run of one. It is the only way into a match that does not go
// through a room: everything with somebody else in it is a room now, public or
// private, and the host of that room decides when it starts.
func (h *Hub) solo(c *Client, name string, cfg *quiz.Config) {
	conf := h.def
	if cfg != nil {
		conf = cfg.Normalize()
	}

	// Restarting is the common case here, not the rare one: the ↻ button and
	// the results screen both land here while the previous run may still be
	// open. A solo run is yours alone, so end it and start again. A run with
	// other people in it is not, so leave it be — `match.leave` is the way out
	// of one of those, and it says out loud what it costs everyone else.
	//
	// Everything else you were in is dropped without ceremony. Asking for a new
	// game is the same statement as leaving the old one, and a client that is in
	// a room and watching somebody else's duel at the same time is a state no
	// screen can draw.
	h.mu.Lock()
	prev := c.match
	if prev != nil && len(prev.players) > 1 {
		h.mu.Unlock()
		return
	}
	h.unwatchLocked(c)
	_, oldFrame, oldTo := h.leaveRoomLocked(c)
	h.mu.Unlock()

	pushAll(oldTo, oldFrame)
	if prev != nil {
		h.finish(prev, c) // clears c.match; c is the leaver, so it gets no `end`
	}

	h.mu.Lock()
	c.name = clampName(name)
	c.cfg = conf
	c.score, c.flagged, c.answers = 0, false, nil
	if c.match != nil {
		h.mu.Unlock()
		return
	}
	m := h.startMatchLocked([]*Client{c}, conf, nil)
	h.mu.Unlock()

	h.announce(m)
	h.broadcastGames()
	h.broadcastRooms() // walking into a solo run may have emptied a public room
}

// unwatchLocked stops c spectating whatever it was spectating. Watching is the
// one thing you can be doing that nobody else can see, so it leaves no trace
// behind and nothing to broadcast.
func (h *Hub) unwatchLocked(c *Client) {
	if m := c.spectates; m != nil {
		delete(m.specs, c)
		c.spectates = nil
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
	if cfg.Mode == quiz.ModeRush {
		m.claims = map[int]*Client{}
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
//
// It also stamps the room as alive, which is why reapRooms can be as simple as
// it is. Every caller of this is a real change to the room — joined, left,
// renamed, relisted, reconfigured, finished a run — and there is no other way
// to tell a room's members anything, nor any timer that calls it. So this is
// the one place the stamp cannot be forgotten by whoever adds the next kind of
// change, which is worth a snapshot function that does not only snapshot.
func (h *Hub) roomFrameLocked(r *Room) (outbound, []*Client) {
	r.touched = time.Now()
	members := make([]playerInfo, 0, len(r.members))
	for _, c := range r.members {
		members = append(members, playerInfo{ID: c.id, Name: c.name})
	}
	cfg := r.cfg
	info := &roomInfo{
		Code:    r.code,
		Members: members,
		Cfg:     &cfg,
		Public:  r.public,
		// Copied, not aliased: the frame is marshalled outside the lock, and
		// by then the next run may already have appended to the room's own.
		Log: append([]roomGame(nil), r.log...),
	}
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

func (h *Hub) roomCreate(c *Client, name string, public bool, cfg *quiz.Config) {
	conf := h.def
	if cfg != nil {
		conf = cfg.Normalize()
	}

	h.mu.Lock()
	h.unwatchLocked(c)
	prev := c.match
	_, oldFrame, oldTo := h.leaveRoomLocked(c)
	c.name = clampName(name)
	c.cfg = conf

	r := &Room{
		code: h.newCodeLocked(), host: c, members: []*Client{c},
		cfg: conf, public: public, touched: time.Now(),
	}
	h.rooms[r.code] = r
	c.room = r
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()

	pushAll(oldTo, oldFrame)
	pushAll(to, frame)
	if prev != nil {
		h.finish(prev, c)
	}
	h.broadcastRooms()
}

// roomPublic lists or unlists a room. The code keeps working either way: going
// private takes the room off the board, it does not lock the door on somebody
// already holding the link.
func (h *Hub) roomPublic(c *Client, public bool) {
	h.mu.Lock()
	r := c.room
	if r == nil || r.host != c || r.public == public {
		h.mu.Unlock()
		return
	}
	r.public = public
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()

	pushAll(to, frame)
	h.broadcastRooms()
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
	h.unwatchLocked(c)
	// Only now, past every way this join could still be refused: walking into a
	// room means walking out of whatever you were playing, but not if you were
	// turned away at the door.
	prev := c.match
	_, oldFrame, oldTo := h.leaveRoomLocked(c)
	c.name = clampName(name)
	c.room = r
	c.cfg = r.cfg
	r.members = append(r.members, c)
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()

	pushAll(oldTo, oldFrame)
	pushAll(to, frame)
	if prev != nil {
		h.finish(prev, c)
	}
	h.broadcastRooms()
}

func (h *Hub) roomLeave(c *Client) {
	h.mu.Lock()
	_, frame, to := h.leaveRoomLocked(c)
	h.mu.Unlock()
	pushAll(to, frame)
	h.broadcastRooms()
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
	h.broadcastRooms() // the list shows what each room is set to
}

// roomName is renaming yourself from inside a room. A deep link drops you
// straight into one without ever showing you the lobby's name field, so this is
// the only place some players get to say who they are.
func (h *Hub) roomName(c *Client, name string) {
	h.mu.Lock()
	c.name = clampName(name)
	r := c.room
	if r == nil {
		h.mu.Unlock()
		return
	}
	frame, to := h.roomFrameLocked(r)
	h.mu.Unlock()
	pushAll(to, frame)
	h.broadcastRooms() // the list is headed by the host's name
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
	h.broadcastRooms()
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
	h.broadcastRooms() // the room is mid-run now, and the list says so
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
	rush := m.claims != nil
	if rush {
		// A rush run is a race for one point per slot, so the ordering rule
		// below does not apply: you are allowed to miss slots, and everyone is
		// buzzing on the same index at the same time. What replaces it is that
		// a slot is settled exactly once — the first valid buzz to reach this
		// line takes it, and every later one falls out here.
		//
		// Arrival order, not the client's own timestamp, is what "first" means.
		// The timestamp is checked below and recorded for the graph, but it is
		// a number the client chose, and a race decided on it would be a race
		// to lie about it.
		if in.I < 0 {
			h.mu.Unlock()
			return
		}
		if _, taken := m.claims[in.I]; taken {
			h.mu.Unlock()
			return
		}
	} else if in.I != len(c.answers) {
		// Answers must arrive in order, starting at 0. Anything else is a
		// desynced or hand-rolled client.
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
	if rush {
		// The slot has to be the one that is actually open — by the client's
		// clock and by this one. Without the second test a client could sit
		// through the whole run and then buzz every slot of it at the whistle,
		// with a plausible timestamp on each.
		lo := m.rushStart(in.I)
		hi := lo + quiz.RushMs
		if in.Ms < lo-250 || in.Ms >= hi+250 {
			h.mu.Unlock()
			return
		}
		if elapsed < lo-250 || elapsed >= hi+rushGrace.Milliseconds() {
			h.mu.Unlock()
			return
		}
		m.claims[in.I] = c
		// Taking a slot ends it, so the rest of the run moves up. Everyone
		// else works this out for themselves from the claim frame below — it
		// carries the same slot and the same timestamp this line folds in —
		// and lands on the same instant without another frame being sent.
		if in.I >= m.rushSlot {
			m.rushSlot, m.rushAt = in.I+1, quiz.RushNext(lo, in.Ms, true)
		}
	}
	if n := len(c.answers); n > 0 && in.Ms-c.answers[n-1].ms < minAnswerGap.Milliseconds() {
		c.flagged = true
	}
	c.answers = append(c.answers, answer{i: in.I, ms: in.Ms})
	c.score = len(c.answers)

	// In rush the buzzer is told too: it does not know it won until this says
	// so, because somebody else's frame may already have been here.
	msg := outbound{T: "score", ID: c.id, Score: c.score, Ms: in.Ms}
	if rush {
		slot := in.I
		msg = outbound{T: "claim", Slot: &slot, ID: c.id, Score: c.score, Ms: in.Ms}
	}
	targets := make([]*Client, 0, len(m.players)+len(m.specs))
	for _, o := range m.players {
		if o != c || rush {
			targets = append(targets, o)
		}
	}
	for s := range m.specs {
		targets = append(targets, s)
	}
	h.mu.Unlock()

	pushAll(targets, msg)
}

// matchLeave is walking out of a run on purpose: the ✕ in the header, mid-match
// or mid-countdown or still in the queue. It is deliberately the same event as
// closing the tab — the run ends for everyone in it — because a half-empty
// board racing a clock nobody is left to beat is not a game, and the graph is
// drawn from a roster fixed when the run started.
//
// The one difference from a disconnect is that this client is still here
// afterwards, and stays in whatever room it walked in from; the room frame
// finish() sends puts it back on the room screen with everybody else.
func (h *Hub) matchLeave(c *Client) {
	h.mu.Lock()
	h.unwatchLocked(c)
	m := c.match
	h.mu.Unlock()

	if m != nil {
		h.finish(m, c)
	}
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
	// A private room is its own scoreboard; only a public room, on the standard
	// settings, with somebody to play against, gets to touch the day's best.
	eligible := m.room != nil && m.room.public && len(m.players) > 1 && m.cfg.Sig() == h.def.Sig()
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
		// Written before the frame is built, so the room screen everyone lands
		// back on already has the run they just played on it. `results` is
		// read-only from here on and shared with the `end` frame below.
		cfg := m.cfg
		m.room.log = append(m.room.log, roomGame{ID: m.id, Results: results, Cfg: &cfg})
		if n := len(m.room.log); n > roomLogMax {
			m.room.log = m.room.log[n-roomLogMax:]
		}
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
	h.broadcastRooms() // the room is open again
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
	h.unwatchLocked(c)
	_, oldFrame, oldTo := h.leaveRoomLocked(c)
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

	pushAll(oldTo, oldFrame)
	c.push(msg)
	for _, s := range scores {
		c.push(s)
	}
	h.broadcastRooms()
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

// broadcastRooms sends everyone the public board. A room that is mid-run stays
// on it, marked, rather than blinking out and back: a list that empties itself
// the moment a game starts reads as "nobody is here", which is the opposite of
// what it means.
// reapRooms closes every room that has sat untouched for roomIdle, and tells
// whoever was still in it why. A room in the middle of a run is left alone no
// matter how long the run runs.
//
// Members are walked out one at a time through leaveRoomLocked rather than the
// map entry being dropped whole, so the room dies the same way it dies when
// the last person leaves of their own accord — host reassignment, code
// released, no second path to keep in step with the first. The frames it hands
// back are for members who are staying, and here nobody is, so they go in the
// bin: everyone gets room.gone instead.
func (h *Hub) reapRooms() {
	h.mu.Lock()
	cutoff := time.Now().Add(-roomIdle)
	var evicted []*Client
	for _, r := range h.rooms {
		if r.match != nil || r.touched.After(cutoff) {
			continue
		}
		evicted = append(evicted, r.members...)
	}
	for _, c := range evicted {
		h.leaveRoomLocked(c)
	}
	h.mu.Unlock()

	if len(evicted) == 0 {
		return
	}
	for _, c := range evicted {
		c.push(outbound{T: "room.gone", Msg: "the room closed after 15 minutes of quiet"})
	}
	h.broadcastRooms()
}

// reapClients puts down the socket of anyone who has gone quiet while holding
// nothing: no room to be dropped out of, no run on the clock, nobody waiting on
// them. A client that is only watching counts as quiet — an abandoned spectate
// costs exactly what an abandoned lobby costs. Rooms are reapRooms' business,
// and their members become this function's the moment it lets them go.
func (h *Hub) reapClients() {
	h.mu.Lock()
	defer h.mu.Unlock()
	cutoff := time.Now().Add(-clientIdle)
	for c := range h.clients {
		if c.room != nil || c.match != nil || c.seen.After(cutoff) {
			continue
		}
		doze(c)
	}
}

func (h *Hub) broadcastRooms() {
	h.mu.Lock()
	rooms := make([]roomBrief, 0, len(h.rooms))
	for _, r := range h.rooms {
		if !r.public || len(r.members) == 0 {
			continue
		}
		cfg := r.cfg
		b := roomBrief{
			Code:    r.code,
			Members: len(r.members),
			Max:     maxRoomSize,
			Playing: r.match != nil && !r.match.done,
			Cfg:     &cfg,
		}
		if r.host != nil {
			b.Host = r.host.name
		}
		rooms = append(rooms, b)
	}
	// Map order is not an order. Sorted by code, the board holds still while
	// you are reading it and a room stays where you last saw it.
	sort.Slice(rooms, func(i, j int) bool { return rooms[i].Code < rooms[j].Code })

	all := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		all = append(all, c)
	}
	msg := outbound{T: "rooms", Rooms: rooms}
	h.mu.Unlock()

	pushAll(all, msg)
}

// gamesLocked is the spectate list: every run worth watching. Its own function
// because the lobby asks for the same list over HTTP and two copies of "worth
// watching" would drift. Callers hold hub.mu.
func (h *Hub) gamesLocked() []gameInfo {
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
	return games
}

// lobbyView is everything the first screen shows, in one answer. The lobby
// holds no socket — it is not playing anything and has nobody to be kept for,
// so it asks once and slowly polls while somebody is looking at it. See
// needsHub in web/src/lib/client.svelte.ts.
type lobbyView struct {
	Online  int        `json:"online"`
	Playing int        `json:"playing"`
	Best    *result    `json:"best,omitempty"`
	Games   []gameInfo `json:"games,omitempty"`
}

func (h *Hub) lobbyView() lobbyView {
	h.mu.Lock()
	defer h.mu.Unlock()
	v := lobbyView{Online: len(h.clients), Games: h.gamesLocked()}
	for c := range h.clients {
		if c.match != nil {
			v.Playing++
		}
	}
	if h.best.Score > 0 {
		best := h.best
		v.Best = &best
	}
	return v
}

func (h *Hub) broadcastGames() {
	h.mu.Lock()
	games := h.gamesLocked()
	all := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		all = append(all, c)
	}
	msg := outbound{T: "games", Games: games}
	h.mu.Unlock()

	pushAll(all, msg)
}

func (h *Hub) handle(c *Client, raw []byte) {
	h.mu.Lock()
	c.seen = time.Now()
	h.mu.Unlock()

	var in inbound
	if err := json.Unmarshal(raw, &in); err != nil {
		log.Printf("bad frame from %s: %v", c.id, err)
		return
	}
	switch in.T {
	case "solo":
		h.solo(c, in.Name, in.Cfg)
	case "answer":
		h.onAnswer(c, in)
	case "spectate":
		h.spectate(c, in.ID)
	case "match.leave":
		h.matchLeave(c)
	case "room.create":
		h.roomCreate(c, in.Name, in.Public, in.Cfg)
	case "room.join":
		h.roomJoin(c, in.Code, in.Name)
	case "room.leave":
		h.roomLeave(c)
	case "room.name":
		h.roomName(c, in.Name)
	case "room.cfg":
		h.roomCfg(c, in.Cfg)
	case "room.public":
		h.roomPublic(c, in.Public)
	case "room.kick":
		h.roomKick(c, in.ID)
	case "room.start":
		h.roomStart(c)
	}
}
