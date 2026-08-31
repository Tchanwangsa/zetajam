<script lang="ts">
  import type { MatchResult, RoomGame } from '../../lib/net'
  import type { Sample } from '../../lib/series'
  import type { Step } from '../../lib/steps'
  import { question } from '../../lib/questions'
  import { getRunContext } from '../../lib/run-context.svelte'
  import { seats as buildSeats } from '../../lib/players'
  import Verdict from './Verdict.svelte'
  import Duel from './Duel.svelte'
  import Table from './Table.svelte'
  import Rate from './Rate.svelte'
  import Graph from '../graph/Graph.svelte'
  import Session from '../session/Session.svelte'

  /**
   * The end of a run, top down in the order the questions get asked: who won,
   * by how much, how fast you were going, how the evening stands, then the run
   * itself under a microscope.
   */
  let {
    results = [],
    samples = [],
    steps = [],
    inRoom = false,
    log = [],
    onAgain,
    onRoom,
    onLobby,
  }: {
    results?: MatchResult[]
    samples?: Sample[]
    /** Your own answers, in order — the graph hangs its tooltips off these. */
    steps?: Step[]
    inRoom?: boolean
    /** Everything this room has played, this run included. Empty for a solo
        run, which is nobody's session but your own. */
    log?: RoomGame[]
    onAgain: () => void
    onRoom: () => void
    onLobby: () => void
  } = $props()

  // The run it is reporting on comes from context; what to do next is a prop.
  const ctx = getRunContext()

  const seatList = $derived(
    buildSeats(
      ctx.players,
      Object.fromEntries(results.map((r) => [r.id, r.score])),
      ctx.selfId,
    ),
  )
  // The scoreboard is ranked; the graph is not — its colours are keyed to
  // roster position, and reordering would relabel everyone's line.
  const ranked = $derived([...seatList].sort((a, b) => b.score - a.score))

  // The question you were still on when the clock stopped — index
  // `steps.length`. Only computed here: mid-run it is the one on your screen.
  // Rush has none, its stream being indexed by slot rather than by your count.
  const pending = $derived(
    ctx.cfg.mode !== 'rush' && steps.length ? question(ctx.seed, steps.length, ctx.cfg) : null,
  )
</script>

<section class="results screen">
  <Verdict {results} selfId={ctx.selfId} />

  <!-- Two players is a duel and more than two is a league table, and they are
       not the same screen with a different row count — see the two files. -->
  {#if ranked.length <= 2}
    <Duel seats={ranked} />
  {:else}
    <Table seats={ranked} {results} />
  {/if}

  <Rate {results} selfId={ctx.selfId} durMs={ctx.durMs} />

  <!-- Above the graph: how the evening stands is what gets asked first. Four
       runs, not twelve — the room screen is where the whole log lives. -->
  <div class="session">
    <Session {log} selfId={ctx.selfId} limit={4} />
  </div>

  <div class="graph">
    <Graph
      {samples}
      {steps}
      {pending}
      slots={ctx.slots}
      durSec={ctx.durMs / 1000}
      seats={seatList}
    />
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
  <div class="hint note">or just hit enter</div>
</section>

<style>
  .results {
    --screen-pad: 4vh;
    width: 100%;
    text-align: center;
  }

  .session {
    width: 100%;
    margin-top: 4vh;
  }

  .graph {
    width: 100%;
    margin: 5vh 0 4vh;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  .hint {
    margin-top: 10px;
  }
</style>
