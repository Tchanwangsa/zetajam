<script lang="ts">
  import type { GameInfo, MatchResult } from '../lib/net'
  import { GLYPH, OPS, fmtDur, isDefault, type Config } from '../lib/config'

  let {
    name = $bindable(''),
    games = [],
    best,
    queued = false,
    cfg,
    onPlay,
    onSolo,
    onSpectate,
    onCancel,
    onSettings,
  }: {
    name?: string
    games?: GameInfo[]
    best?: MatchResult
    queued?: boolean
    cfg: Config
    onPlay: () => void
    onSolo: () => void
    onSpectate: (id: string) => void
    onCancel: () => void
    onSettings: () => void
  } = $props()

  let input = $state<HTMLInputElement>()
  $effect(() => input?.focus())
</script>

<section class="lobby">
  <h1>zetajam</h1>
  <p class="tag">mental arithmetic, head to head</p>

  {#if queued}
    <div class="queued">
      <span class="pulse"></span>
      looking for an opponent
    </div>
    <button class="ghost" onclick={onCancel}>play alone instead</button>
  {:else}
    <input
      class="name"
      bind:this={input}
      bind:value={name}
      onkeydown={(e) => e.key === 'Enter' && onPlay()}
      placeholder="your name"
      maxlength="20"
      autocomplete="off"
      spellcheck="false"
      aria-label="your name"
    />
    <div class="actions">
      <button class="primary" onclick={onPlay}>find a match</button>
      <button class="ghost" onclick={onSolo}>practice solo</button>
    </div>
  {/if}

  <button class="mode num" onclick={onSettings} title="settings">
    <span class="ops">{OPS.filter((o) => cfg.ops.includes(o)).map((o) => GLYPH[o]).join(' ')}</span>
    <span class="dot">·</span>
    <span>{fmtDur(cfg.durSec)}</span>
    {#if !isDefault(cfg)}<span class="custom">custom</span>{/if}
  </button>

  {#if best}
    <p class="best num">best today — <strong>{best.score}</strong> by {best.name}</p>
  {/if}

  {#if games.length}
    <div class="spectate">
      <div class="head">live now</div>
      {#each games as g (g.id)}
        <button class="row num" onclick={() => onSpectate(g.id)}>
          <span class="who">{g.n1}</span>
          <span class="sc">{g.s1} – {g.s2}</span>
          <span class="who right">{g.n2}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-top: 8vh;
  }
  h1 {
    font-size: 2.4rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .tag {
    color: var(--muted);
    margin: 6px 0 40px;
    font-size: 14px;
  }
  .name {
    width: 260px;
    height: 48px;
    text-align: center;
    font-size: 17px;
    background: var(--panel);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    outline: none;
    transition: border-color 140ms ease;
  }
  .name:focus {
    border-color: var(--accent);
  }
  .name::placeholder {
    color: var(--faint);
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
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

  .queued {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 15px;
    margin-bottom: 18px;
  }
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: breathe 1.6s ease-in-out infinite;
  }
  @keyframes breathe {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 1; }
  }

  /* The one place the current settings are visible without opening the panel,
     and the second way into it. */
  .mode {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 20px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--muted);
    border: 1px solid transparent;
    transition: border-color 140ms ease, color 140ms ease;
  }
  .mode:hover {
    border-color: var(--line);
    color: var(--text);
  }
  .ops {
    letter-spacing: 0.06em;
  }
  .dot {
    color: var(--faint);
  }
  .custom {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
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
    width: 300px;
    max-width: 100%;
  }
  .head {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: 8px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 10px;
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
  .who.right {
    text-align: right;
  }
  .sc {
    color: var(--faint);
  }
</style>
