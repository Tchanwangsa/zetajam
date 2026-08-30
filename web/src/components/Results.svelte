<script lang="ts">
  import type { MatchResult, PlayerInfo, RoomGame } from '../lib/net'
  import type { Sample } from '../lib/series'
  import type { Step } from '../lib/steps'
  import type { Slot } from '../lib/rush'
  import type { Config } from '../lib/config'
  import { question } from '../lib/questions'
  import { seats as buildSeats } from '../lib/players'
  import Graph from './Graph.svelte'
  import Session from './Session.svelte'

  let {
    results = [],
    selfId,
    players = [],
    samples = [],
    steps = [],
    slots = [],
    seed,
    cfg,
    durMs,
    inRoom = false,
    log = [],
    onAgain,
    onRoom,
    onLobby,
  }: {
    results?: MatchResult[]
    selfId: string
    /** Roster order, so the graph colours match the ones you just played under. */
    players?: PlayerInfo[]
    samples?: Sample[]
    /** Your own answers, in order — the graph hangs its tooltips off these. */
    steps?: Step[]
    /** Rush only: every question the run held. See lib/rush.ts. */
    slots?: Slot[]
    /** The run's question stream, so the one it ended on can be named. */
    seed: number
    cfg: Config
    durMs: number
    inRoom?: boolean
    /** Everything this room has played, this run included. Empty for a solo
        run, which is nobody's session but your own. */
    log?: RoomGame[]
    onAgain: () => void
    onRoom: () => void
    onLobby: () => void
  } = $props()

  const byId = $derived(Object.fromEntries(results.map((r) => [r.id, r])))
  const seatList = $derived(
    buildSeats(
      players,
      Object.fromEntries(results.map((r) => [r.id, r.score])),
      selfId,
    ),
  )
  // The scoreboard is ranked; the graph is not, because its colours are keyed
  // to roster position and reordering them would relabel everyone's line.
  const ranked = $derived([...seatList].sort((a, b) => b.score - a.score))
  const mine = $derived(results.find((r) => r.id === selfId))

  const verdict = $derived.by(() => {
    if (!results.length) return ''
    if (results.length === 1) return 'run complete'
    const top = Math.max(...results.map((r) => r.score))
    const leaders = results.filter((r) => r.score === top)
    if (leaders.length > 1) return leaders.some((l) => l.id === selfId) ? 'dead even' : 'a tie'
    return leaders[0].id === selfId ? 'you win' : `${leaders[0].name} wins`
  })

  const rate = $derived(mine ? (mine.score * 60000) / durMs : 0)

  // The question you were still on when the clock stopped — index `steps.length`
  // in the stream, because every question before it is an answer in the log.
  // Only ever computed here: mid-run it is the one on your screen.
  //
  // Rush has no such question. Its stream is indexed by slot rather than walked
  // one answer at a time, so the count of what you won says nothing about where
  // the run got to, and the last question was everybody's anyway.
  const pending = $derived(
    cfg.mode !== 'rush' && steps.length ? question(seed, steps.length, cfg) : null,
  )
</script>

<section class="results">
  <div class="verdict">{verdict}</div>

  {#if ranked.length <= 2}
    <div class="scores num">
      {#each ranked as s, i (s.id)}
        {#if i > 0}<div class="vs">–</div>{/if}
        <div class="col">
          <div class="big" style:color={s.color}>{s.score}</div>
          <div class="who">{s.you ? 'you' : s.name}</div>
        </div>
      {/each}
    </div>
  {:else}
    <ol class="table num">
      {#each ranked as s, i (s.id)}
        <li class:mine={s.you}>
          <span class="rank">{i + 1}</span>
          <span class="dot" style:background={s.color}></span>
          <span class="who">{s.you ? 'you' : s.name}</span>
          {#if byId[s.id]?.flagged}<span class="tag">flagged</span>{/if}
          <span class="pts" style:color={s.color}>{s.score}</span>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="meta num">
    {rate.toFixed(1)} answers / min
  </div>
  {#if mine?.flagged}
    <div class="flag">flagged: answers came in faster than a human hand</div>
  {/if}

  <!-- Above the graph, because it answers the question that gets asked first:
       the graph is this run under a microscope, and how the evening stands is
       what everybody looks up at each other about. Four runs, not twelve — the
       room screen is where the whole log lives. -->
  <div class="session">
    <Session {log} {selfId} limit={4} />
  </div>

  <div class="graph">
    <Graph {samples} {steps} {pending} {slots} durSec={durMs / 1000} seats={seatList} />
  </div>

  <div class="actions">
    {#if inRoom}
      <button class="btn btn-primary" onclick={onRoom}>back to the room</button>
      <button class="btn btn-ghost" onclick={onLobby}>leave</button>
    {:else}
      <button class="btn btn-primary" onclick={onAgain}>play again</button>
      <button class="btn btn-ghost" onclick={onLobby}>back</button>
    {/if}
  </div>
  <div class="hint">or just hit enter</div>
</section>

<style>
  .results {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    padding-top: 4vh;
  }
  .verdict {
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .scores {
    display: flex;
    align-items: center;
    gap: 28px;
    margin: 18px 0 4px;
  }
  .big {
    font-size: clamp(3.4rem, 11vw, 5.6rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .who {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }
  .vs {
    color: var(--faint);
    font-size: 1.6rem;
    align-self: flex-start;
    margin-top: 1.4rem;
  }

  .table {
    list-style: none;
    margin: 20px 0 8px;
    padding: 0;
    width: 320px;
    max-width: 100%;
    text-align: left;
  }
  .table li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 14px;
  }
  .table li.mine {
    background: var(--grid);
  }
  .rank {
    width: 1.4em;
    color: var(--faint);
    font-size: 12px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
  .table .who {
    margin: 0;
    flex: 1;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--danger);
  }
  .pts {
    font-weight: 600;
  }

  .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .flag {
    color: var(--danger);
    font-size: 12px;
    margin-top: 6px;
  }

  .session {
    display: flex;
    justify-content: center;
    width: 100%;
    margin-top: 4vh;
  }

  .graph {
    width: 100%;
    margin: 5vh 0 4vh;
  }

  .actions {
    display: flex;
    gap: 10px;
  }
  .hint {
    font-size: 11px;
    color: var(--faint);
    margin-top: 10px;
  }
</style>
