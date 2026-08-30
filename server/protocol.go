package main

import "zetajam/internal/quiz"

// Wire format. Every frame is a JSON object with a "t" discriminator.
//
// The design goal is that nothing travels per keystroke. A client sends one
// small frame per *correct answer* and nothing else, and the server sends one
// frame back per answer somebody else got right. A 120s match is a few dozen
// frames each way, whether it is two players or eight.
//
// Rush is the one mode where a client cannot score itself, because the point
// belongs to whoever's frame lands first and only the server knows that. So it
// answers as usual and waits for a `claim` frame to say who took the slot —
// still one frame in and one out per question, and there are only DurSec/5 of
// those in a whole run.

type inbound struct {
	T      string `json:"t"`
	Name   string `json:"name,omitempty"`
	ID     string `json:"id,omitempty"`     // spectate target, or kick target
	Code   string `json:"code,omitempty"`   // room code
	Public bool   `json:"public,omitempty"` // room.create, room.public

	// The settings the player wants. Nil means "whatever the server runs by
	// default". Never trusted as sent — the hub normalizes it first.
	Cfg *quiz.Config `json:"cfg,omitempty"`

	// answer
	I  int   `json:"i"`  // question index; the slot number in a rush run
	V  int   `json:"v"`  // the value the player typed
	Ms int64 `json:"ms"` // ms since the match went live
}

type playerInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type result struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Score   int    `json:"score"`
	Flagged bool   `json:"flagged"`
}

// gameInfo is one row of the spectate list. Names and scores are parallel and
// in match order, so a room of six reads the same way a duel does.
type gameInfo struct {
	ID     string   `json:"id"`
	Names  []string `json:"names"`
	Scores []int    `json:"scores"`
}

// roomGame is one finished run, kept for as long as the room lives. Results
// are in the roster order the run was played in, and carry the ids of players
// who have since walked out — a record of the evening is worth nothing if it
// forgets whoever left after losing.
//
// The config comes along because the host can change it between runs, and a
// score means nothing without the settings it was scored under.
type roomGame struct {
	ID      string       `json:"id"`
	Results []result     `json:"results"`
	Cfg     *quiz.Config `json:"cfg,omitempty"`
}

// roomInfo is the whole of a room: who is in it, who runs it, what it is set
// to, whether the world can see it, and what has been played in it. Sent in
// full on every change — it is a handful of names and at most roomLogMax
// short rows.
type roomInfo struct {
	Code    string       `json:"code"`
	HostID  string       `json:"hostId"`
	Members []playerInfo `json:"members"`
	Cfg     *quiz.Config `json:"cfg"`
	Public  bool         `json:"public"`
	// Oldest first. Absent rather than empty until the room has played
	// something — see the `omitempty` note in App.svelte.
	Log []roomGame `json:"log,omitempty"`
}

// roomBrief is one row of the public-room list: enough to decide whether to
// walk in, and nothing more. Private rooms never appear in it — the code is
// the only way to find one of those.
type roomBrief struct {
	Code    string       `json:"code"`
	Host    string       `json:"host"`
	Members int          `json:"members"`
	Max     int          `json:"max"`
	Playing bool         `json:"playing"`
	Cfg     *quiz.Config `json:"cfg"`
}

type outbound struct {
	T string `json:"t"`

	// welcome
	Self *playerInfo `json:"self,omitempty"`

	// online
	Online  int `json:"online,omitempty"`
	Playing int `json:"playing,omitempty"`

	// match
	Seed       uint32       `json:"seed,omitempty"`
	DurMs      int64        `json:"durMs,omitempty"`
	StartsInMs int64        `json:"startsInMs,omitempty"`
	Cfg        *quiz.Config `json:"cfg,omitempty"`
	You        *playerInfo  `json:"you,omitempty"`
	Players    []playerInfo `json:"players,omitempty"`
	Spectating bool         `json:"spectating,omitempty"`

	// score / claim
	ID    string `json:"id,omitempty"`
	Score int    `json:"score,omitempty"`
	Ms    int64  `json:"ms,omitempty"`

	// claim — the rush slot this frame settles. A pointer, not a plain int:
	// slot 0 is a real slot and `omitempty` would drop it on the floor, and a
	// plain field with no omitempty would ride along on every other frame
	// type, all of which share this struct.
	Slot *int `json:"i,omitempty"`

	// end
	Results []result `json:"results,omitempty"`

	// room
	Room *roomInfo `json:"room,omitempty"`

	// rooms — the public list, sent to everyone whenever it changes
	Rooms []roomBrief `json:"rooms,omitempty"`

	// games / best / err
	Games []gameInfo `json:"games,omitempty"`
	Best  *result    `json:"best,omitempty"`
	Msg   string     `json:"msg,omitempty"`
}
