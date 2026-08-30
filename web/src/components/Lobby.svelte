<script lang="ts">
  import type { GameInfo, MatchResult } from '../lib/net'

  let {
    name = $bindable(''),
    games = [],
    best,
    onMulti,
    onSolo,
    onSpectate,
  }: {
    name?: string
    games?: GameInfo[]
    best?: MatchResult
    onMulti: () => void
    onSolo: () => void
    onSpectate: (id: string) => void
  } = $props()

  let input = $state<HTMLInputElement>()
  $effect(() => input?.focus())
</script>

<section class="lobby">
  <!-- A title, finally. The wordmark in the header says what the app is
       called; this says what you are about to do, which is the thing a first
       visit is actually missing. It lives on the lobby only — every other
       screen has a run in it and does not need welcoming. -->
  <h1 class="welcome">
    welcome to
    <span class="mark">
      zetajam
      <svg class="squiggle" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M2 6.4 C 14 2.2, 24 8.6, 36 5.2 S 58 1.8, 70 6 S 94 8.4, 118 3.4"
          pathLength="1"
        />
      </svg>
    </span>
  </h1>
  <p class="sub">zetamac mental arithmetic head to head duels with friends!</p>

  <input
    class="field name"
    bind:this={input}
    bind:value={name}
    onkeydown={(e) => e.key === 'Enter' && onMulti()}
    placeholder="your name"
    maxlength="20"
    autocomplete="off"
    spellcheck="false"
    aria-label="your name"
  />
  <!-- Two doors, not three. Playing against somebody is one thing now — a
       room, public or private — and the choice between those belongs on the
       screen where you make one, not here. -->
  <div class="actions">
    <button class="btn btn-primary" onclick={onMulti}>multiplayer</button>
    <button class="btn btn-ghost" onclick={onSolo}>practice solo</button>
  </div>

  {#if best}
    <p class="best num">best today — <strong>{best.score}</strong> by {best.name}</p>
  {/if}

  {#if games.length}
    <div class="spectate">
      <div class="micro head">live now</div>
      {#each games as g (g.id)}
        <button class="row num" onclick={() => onSpectate(g.id)}>
          <span class="who">{g.names.join(' · ')}</span>
          <span class="sc">{g.scores.join(' – ')}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* The wordmark lives in the header now, so there is no title to sit under —
     the name field is the first thing on the screen and the top padding is
     what keeps it off the settings bar. */
  .lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-top: 9vh;
  }

  .welcome {
    margin: 0;
    /* Two lines on a phone is fine; three is a page of nothing but greeting. */
    font-size: clamp(28px, 5.2vw, 40px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  /* The underline is drawn under the word rather than through the text box, so
     it stays put whatever the line-height does. */
  .mark {
    position: relative;
    white-space: nowrap;
    color: var(--accent);
  }
  .squiggle {
    position: absolute;
    left: 0;
    top: 100%;
    width: 100%;
    height: 10px;
    margin-top: -2px;
    overflow: visible;
  }
  .squiggle path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linecap: round;
    opacity: 0.7;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: underline 520ms ease-out 220ms forwards;
  }
  @keyframes underline {
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .squiggle path {
      stroke-dashoffset: 0;
    }
  }

  .sub {
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 15px;
  }
  .name {
    margin-top: 34px;
    width: 260px;
    max-width: 100%;
    height: 48px;
    text-align: center;
    font-size: 17px;
  }

  /* One column, one width. Side by side these read as a row of equals; stacked
     and matched to the field above them, the primary one is plainly first. */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 260px;
    max-width: 100%;
    margin-top: 12px;
  }
  .actions :global(.btn) {
    width: 100%;
  }

  .best {
    color: var(--muted);
    font-size: 13px;
    margin-top: 32px;
  }
  .best strong {
    color: var(--text);
    font-weight: 600;
  }

  .spectate {
    margin-top: 28px;
    width: 320px;
    max-width: 100%;
  }
  .head {
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted);
    transition: background 120ms ease, color 120ms ease;
  }
  .row:hover {
    background: var(--panel);
    color: var(--text);
  }
  .who {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sc {
    color: var(--faint);
    flex: none;
  }
</style>
