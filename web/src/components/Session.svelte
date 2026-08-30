<script lang="ts">
  import type { RoomGame } from '../lib/net'
  import { digest } from '../lib/session'
  import { summary } from '../lib/config'

  /**
   * How the evening is going: your record against everyone you have played in
   * this room, and the runs it was built from.
   *
   * A results screen answers "who won that one" and then throws it away, which
   * is the wrong memory for the thing people actually do with this — sit in one
   * room and play eight times. So the room keeps the log and this reads it back
   * in the two shapes it gets asked for out loud: *am I up on her*, and *what
   * happened just now*.
   *
   * Both are shown on the room screen too, not only at the end of a run, so the
   * standings are there while everyone is deciding whether to go again.
   */
  let {
    log = [],
    selfId,
    /** The room screen has the space for every run; the end screen does not. */
    limit = 0,
  }: {
    log?: RoomGame[]
    selfId: string
    limit?: number
  } = $props()

  const s = $derived(digest(log, selfId))
  const runs = $derived(limit > 0 ? s.runs.slice(0, limit) : s.runs)
  const hidden = $derived(s.runs.length - runs.length)

  const TAG: Record<string, string> = { won: 'won', lost: 'lost', drew: 'tied', solo: 'solo' }
</script>

{#if s.runs.length}
  <section class="session">
    {#if s.heads.length}
      <div class="micro head">
        head to head
        <span class="note num">{s.runs.length} {s.runs.length === 1 ? 'run' : 'runs'}</span>
      </div>
      <ul class="heads">
        {#each s.heads as h (h.id)}
          <li>
            <span class="dot" style:background={h.color}></span>
            <span class="who">{h.name}</span>
            <!-- One string, three numbers, always in that order — a record is
                 read as a shape, and W–D–L is the shape everybody already
                 knows. The middle number greys out when nothing has been
                 drawn, which is most of the time. -->
            <span
              class="wdl num"
              title="won – drawn – lost"
              aria-label="{h.won} won, {h.drew} drawn, {h.lost} lost"
            >
              <b class:zero={!h.won}>{h.won}</b><i>–</i><b class:zero={!h.drew}>{h.drew}</b><i
                >–</i
              ><b class:zero={!h.lost}>{h.lost}</b>
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="micro head runs-head">recent runs</div>
    <ol class="runs">
      {#each runs as r (r.id)}
        <li>
          <span class="n num">{r.n}</span>
          <span class="line">
            {#each r.seats as seat, i (seat.id)}
              {#if i > 0}<i class="sep">·</i>{/if}<span class="seat" class:top={seat.top}>
                <span class="nm" style:color={seat.color}>{seat.you ? 'you' : seat.name}</span>
                <b class="pts num">{seat.score}</b>
              </span>
            {/each}
          </span>
          <span class="cfg num">{r.cfg ? summary(r.cfg) : ''}</span>
          {#if r.outcome}<span class="tag {r.outcome}">{TAG[r.outcome]}</span>{/if}
        </li>
      {/each}
    </ol>
    {#if hidden > 0}
      <p class="more num">{hidden} earlier {hidden === 1 ? 'run' : 'runs'} — they are on the room screen</p>
    {/if}
  </section>
{/if}

<style>
  .session {
    width: 420px;
    max-width: 100%;
    text-align: left;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .runs-head {
    margin-top: 22px;
  }
  .note {
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
  }

  .heads,
  .runs {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .heads li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 14px;
  }
  .heads li:nth-child(odd) {
    background: var(--grid);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
  .who {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wdl {
    font-size: 15px;
    letter-spacing: 0.02em;
  }
  .wdl b {
    font-weight: 600;
    color: var(--text);
  }
  /* A nought and a dash are both "nothing here", and they are the two things
     in the row that must not disappear — a record that reads 1–1 instead of
     1–1–0 is a different record. Muted, not faint. */
  .wdl b.zero {
    color: var(--muted);
    font-weight: 400;
  }
  .wdl i {
    font-style: normal;
    color: var(--muted);
    padding: 0 2px;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    text-align: right;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .tag.won {
    color: var(--accent);
  }

  .more {
    margin: 10px 0 0;
    padding: 0 10px;
    font-size: 11px;
    color: var(--faint);
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
