<script lang="ts">
  import type { Head } from '../../lib/session'
  import Dot from '../ui/Dot.svelte'

  /**
   * *Am I up on her.* One line per person, in lib/session.ts's order — most
   * played first. Hidden entirely until there is somebody to be up on.
   */
  let {
    heads,
    /** How many runs the record was built from, counted over the whole log. */
    total,
  }: {
    heads: Head[]
    total: number
  } = $props()
</script>

{#if heads.length}
  <div class="micro head micro-head">
    head to head
    <span class="micro-note num">{total} {total === 1 ? 'run' : 'runs'}</span>
  </div>
  <ul class="heads">
    {#each heads as h (h.id)}
      <li class="roster">
        <Dot color={h.color} />
        <span class="who roster-name trunc">{h.name}</span>
        <!-- A record is read as a shape, and W–D–L is the shape everybody
             already knows. The middle number greys out when nothing has
             been drawn, which is most of the time. -->
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

<style>
  .head {
    margin-bottom: 6px;
  }

  .heads {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .heads li {
    padding: 7px 10px;
  }
  .heads li:nth-child(odd) {
    background: var(--grid);
  }
  .wdl {
    font-size: 15px;
    letter-spacing: 0.02em;
  }
  .wdl b {
    font-weight: 600;
    color: var(--text);
  }
  /* A nought must not disappear — a record reading 1–1 instead of 1–1–0 is a
     different record. Muted, not faint. */
  .wdl b.zero {
    color: var(--muted);
    font-weight: 400;
  }
  .wdl i {
    font-style: normal;
    color: var(--muted);
    padding: 0 2px;
  }
</style>
