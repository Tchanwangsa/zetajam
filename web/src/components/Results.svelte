<script lang="ts">
  import type { MatchResult, PlayerInfo } from '../lib/net'
  import type { Sample } from '../lib/series'
  import Graph from './Graph.svelte'

  let {
    results = [],
    selfId,
    opp,
    samples = [],
    durMs,
    onAgain,
    onLobby,
  }: {
    results?: MatchResult[]
    selfId: string
    opp?: PlayerInfo
    samples?: Sample[]
    durMs: number
    onAgain: () => void
    onLobby: () => void
  } = $props()

  const mine = $derived(results.find((r) => r.id === selfId))
  const theirs = $derived(results.find((r) => r.id !== selfId))

  const verdict = $derived.by(() => {
    if (!mine) return ''
    if (!theirs) return 'run complete'
    if (mine.score > theirs.score) return 'you win'
    if (mine.score < theirs.score) return `${theirs.name} wins`
    return 'dead even'
  })

  const rate = $derived(mine ? (mine.score * 60000) / durMs : 0)
</script>

<section class="results">
  <div class="verdict">{verdict}</div>

  <div class="scores num">
    <div class="col">
      <div class="big">{mine?.score ?? 0}</div>
      <div class="who">you</div>
    </div>
    {#if theirs}
      <div class="vs">–</div>
      <div class="col">
        <div class="big opp">{theirs.score}</div>
        <div class="who">{theirs.name}</div>
      </div>
    {/if}
  </div>

  <div class="meta num">{rate.toFixed(1)} answers / min</div>
  {#if mine?.flagged}
    <div class="flag">flagged: answers came in faster than a human hand</div>
  {/if}

  <div class="graph">
    <Graph
      {samples}
      durSec={durMs / 1000}
      hasOpp={!!theirs}
      youName="you"
      oppName={theirs?.name ?? opp?.name ?? '—'}
    />
  </div>

  <div class="actions">
    <button class="primary" onclick={onAgain}>play again</button>
    <button class="ghost" onclick={onLobby}>back</button>
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
    color: var(--accent);
  }
  .big.opp {
    color: var(--opp);
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
  .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .flag {
    color: var(--danger);
    font-size: 12px;
    margin-top: 6px;
  }

  .graph {
    width: 100%;
    margin: 5vh 0 4vh;
  }

  .actions {
    display: flex;
    gap: 10px;
  }
  .primary,
  .ghost {
    height: 42px;
    padding: 0 20px;
    border-radius: var(--radius);
    font-size: 14px;
    border: 1.5px solid transparent;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .primary {
    background: var(--accent);
    color: var(--bg);
    font-weight: 500;
  }
  .primary:hover {
    filter: brightness(1.08);
  }
  .ghost {
    border-color: var(--line);
    color: var(--muted);
  }
  .ghost:hover {
    border-color: var(--faint);
    color: var(--text);
  }
  .hint {
    font-size: 11px;
    color: var(--faint);
    margin-top: 10px;
  }
</style>
