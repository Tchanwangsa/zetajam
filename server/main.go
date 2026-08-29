package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

//go:embed all:dist
var dist embed.FS

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 25 * time.Second
)

// allowedOrigins is empty when ORIGINS is unset, which means "same origin
// only, plus localhost". The frontend can be deployed somewhere else — Vercel,
// Cloudflare Pages — and then it has to be named here, because a websocket
// upgrade from another origin is not covered by CORS and the browser will not
// stop it for us.
var allowedOrigins []string

func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // not a browser
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	host := u.Hostname()
	if host == "localhost" || host == "127.0.0.1" {
		return true
	}
	for _, a := range allowedOrigins {
		if a == "*" || strings.EqualFold(a, origin) || strings.EqualFold(a, u.Host) {
			return true
		}
	}
	return false
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkOrigin,
}

func main() {
	// Cloud Run hands the port in through PORT and will not negotiate.
	addr := flag.String("addr", envOr("ADDR", ":"+envOr("PORT", "8080")), "listen address")
	dur := flag.Duration("dur", 120*time.Second, "match length for clients that send no settings of their own")
	origins := flag.String("origins", os.Getenv("ORIGINS"), "comma-separated origins allowed to open a websocket, for a separately hosted frontend")
	flag.Parse()

	for _, o := range strings.Split(*origins, ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowedOrigins = append(allowedOrigins, o)
		}
	}

	hub := NewHub(*dur)

	// Spectator scoreboards refresh on a slow ticker rather than on every
	// answer — nobody watching a list needs 4Hz.
	go func() {
		for range time.Tick(2 * time.Second) {
			hub.broadcastGames()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	})
	// Not /healthz: Google's edge reserves that path on *.run.app and answers
	// it with its own 404 before the request ever reaches this process.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatal(err)
	}
	mux.Handle("/", spa(sub))

	log.Printf("zetajam listening on %s (default match length %s, extra origins %v)", *addr, *dur, allowedOrigins)
	srv := &http.Server{
		Addr:         *addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // websockets
	}
	log.Fatal(srv.ListenAndServe())
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// spa serves the built frontend, falling back to index.html so client-side
// routes — /r/ABCD, the room deep links — survive a refresh. When the frontend
// is hosted elsewhere this tree is a stub and only /ws and /health matter.
func spa(root fs.FS) http.Handler {
	files := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(root, p); err != nil {
			b, err := fs.ReadFile(root, "index.html")
			if err != nil {
				http.Error(w, "frontend not built — run `make web`", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(b)
			return
		}
		if strings.HasPrefix(p, "assets/") {
			// Vite fingerprints these, so they are safe to cache forever.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})
}

func serveWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &Client{send: make(chan []byte, 32), hub: hub}
	hub.add(c)

	go writePump(c, conn)
	readPump(c, conn)
}

func readPump(c *Client, conn *websocket.Conn) {
	defer func() {
		c.hub.remove(c)
		conn.Close()
	}()
	conn.SetReadLimit(1024)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		c.hub.handle(c, msg)
	}
}

func writePump(c *Client, conn *websocket.Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
