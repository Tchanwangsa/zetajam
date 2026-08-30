<script lang="ts">
  import type { Run } from '../../lib/session'
  import { summary } from '../../lib/config'

  /**
   * *What happened just now*, newest first. The end screen only has room for
   * the last few, so what is missing is counted at the bottom rather than cut
   * off silently.
   */
  let {
    runs,
    /** The room screen has the space for every run; the end screen does not. */
    limit = 0,
  }: {
    runs: Run[]
    limit?: number
  } = $props()

  const shown = $derived(limit > 0 ? runs.slice(0, limit) : runs)
  const hidden = $derived(runs.length - shown.length)

  const TAG: Record<string, string> = { won: 'won', lost: 'lost', drew: 'tied', solo: 'solo' }
</script>

<div class="micro head micro-head runs-head">recent runs</div>
<ol class="runs">
  {#each shown as r (r.id)}
    <li>
      <span class="n num">{r.n}</span>
      <span class="line trunc">
        {#each r.seats as seat, i (seat.id)}
          {#if i > 0}<i class="sep">·</i>{/if}<span class="seat" class:top={seat.top}>
            <span class="nm" style:color={seat.color}>{seat.you ? 'you' : seat.name}</span>
            <b class="pts num">{seat.score}</b>
          </span>
        {/each}
      </span>
      <span class="cfg num trunc">{r.cfg ? summary(r.cfg) : ''}</span>
      {#if r.outcome}<span class="tag {r.outcome}">{TAG[r.outcome]}</span>{/if}
    </li>
  {/each}
</ol>
{#if hidden > 0}
  <p class="more num note">{hidden} earlier {hidden === 1 ? 'run' : 'runs'} — they are on the room screen</p>
{/if}

<style>
  .head {
    margin-bottom: 6px;
  }
  .runs-head {
    margin-top: 22px;
  }

  .runs {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* The log. Four columns that hold their place down the list, so it is read
     one column at a time — which run, who scored what, on what, how it went. */
  .runs li {
    display: grid;
    grid-template-columns: 1.6rem 1fr auto 2.6rem;
    align-items: baseline;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 13px;
  }
  .n {
    color: var(--faint);
    font-size: 12px;
  }
  .line {
    min-width: 0;
  }
  .sep {
    font-style: normal;
    color: var(--faint);
    padding: 0 5px;
  }
  .seat .nm {
    opacity: 0.72;
  }
  .seat.top .nm {
    opacity: 1;
  }
  .pts {
    color: var(--muted);
    font-weight: 400;
    margin-left: 4px;
  }
  .seat.top .pts {
    color: var(--text);
    font-weight: 600;
  }
  .cfg {
    color: var(--faint);
    font-size: 11px;
  }
  .tag {
    text-align: right;
  }
  .tag.won {
    color: var(--accent);
  }

  .more {
    margin: 10px 0 0;
    padding: 0 10px;
  }

  @media (max-width: 520px) {
    .runs li {
      grid-template-columns: 1.4rem 1fr 2.6rem;
    }
    .cfg {
      display: none;
    }
  }
</style>
