// Prints the first N questions of a seed under a config. Paired with
// web/scripts/parity.ts to prove that the Go and TypeScript generators agree;
// `make parity` diffs them, under the default config and a custom one.
//
//	go run ./cmd/parity <seed> <n> ['{"ops":["mul"],"durSec":60}']
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"

	"zetajam/internal/quiz"
)

func main() {
	seed, n := uint32(123456789), 200
	cfg := quiz.Default()
	if len(os.Args) > 1 {
		v, _ := strconv.ParseUint(os.Args[1], 10, 32)
		seed = uint32(v)
	}
	if len(os.Args) > 2 {
		n, _ = strconv.Atoi(os.Args[2])
	}
	if len(os.Args) > 3 {
		if err := json.Unmarshal([]byte(os.Args[3]), &cfg); err != nil {
			log.Fatalf("bad config: %v", err)
		}
	}
	cfg = cfg.Normalize()
	w := bufio.NewWriter(os.Stdout)
	defer w.Flush()
	for i := 0; i < n; i++ {
		q := quiz.At(seed, i, cfg)
		fmt.Fprintf(w, "%d\t%s\t%d\n", i, q.Text, q.Answer)
	}
}
