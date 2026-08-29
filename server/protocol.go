package main

import "zetajam/internal/quiz"

// Wire format. Every frame is a JSON object with a "t" discriminator.
//
// The design goal is that nothing travels per keystroke. A client sends one
// small frame per *correct answer* and nothing else, and the server sends one
// frame back per answer somebody else got right. A 120s match is a few dozen
// frames each way, whether it is two players or eight.

type inbound struct {
	T    string `json:"t"`
	Name string `json:"name,omitempty"`
	Solo bool   `json:"solo,omitempty"`
	ID   string `json:"id,omitempty"`   // spectate target, or kick target
	Code string `json:"code,omitempty"` // room code

	// The settings the player wants. Nil means "whatever the server runs by
	// default". Never trusted as sent — the hub normalizes it first.
	Cfg *quiz.Config `json:"cfg,omitempty"`

	// answer
	I  int   `json:"i"`  // question index
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

// roomInfo is the whole of a private room: who is in it, who runs it, and what
// it is set to. Sent in full on every change — it is a handful of names.
type roomInfo struct {
	Code    string       `json:"code"`
	HostID  string       `json:"hostId"`
	Members []playerInfo `json:"members"`
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

	// score
	ID    string `json:"id,omitempty"`
	Score int    `json:"score,omitempty"`
	Ms    int64  `json:"ms,omitempty"`

	// end
	Results []result `json:"results,omitempty"`

	// room
	Room *roomInfo `json:"room,omitempty"`

	// games / best / err
	Games []gameInfo `json:"games,omitempty"`
	Best  *result    `json:"best,omitempty"`
	Msg   string     `json:"msg,omitempty"`
}
