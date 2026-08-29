<script lang="ts">
  import {
    OPS,
    GLYPH,
    OP_NAME,
    TIMES,
    MAX_TERM,
    defaults,
    normalize,
    fmtDur,
    isDefault,
    type Config,
    type Op,
    type Range,
  } from '../lib/config'

  let {
    cfg = $bindable(),
    live = false,
    onClose,
  }: {
    cfg: Config
    /** True while a run is in progress, so the panel can say what applies when. */
    live?: boolean
    onClose: () => void
  } = $props()

  // Which operation has its range dropdown popped out. Null is all four
  // collapsed, which is how the panel opens.
  let open = $state<Op | null>(null)

  const enabled = (op: Op) => cfg.ops.includes(op)

  function toggle(op: Op) {
    const next = OPS.filter((o) => (o === op ? !enabled(op) : enabled(o))) as Op[]
    if (!next.length) return // one operation always has to stay on
    cfg = { ...cfg, ops: next }
  }

  // Ranges are written straight through without cross-clamping, so that typing
  // "1" on the way to "150" is not rewritten under the cursor. normalize()
  // runs on blur instead, where it can only surprise you once.
  function setTerm(op: Op, k: number, raw: string) {
    const r = [...cfg.ranges[op]] as Range
    r[k] = Math.min(MAX_TERM, Math.max(0, Number(raw.replace(/\D/g, '')) || 0))
    cfg = { ...cfg, ranges: { ...cfg.ranges, [op]: r } }
  }

  let durText = $state(String(cfg.durSec))
  function commitDur() {
    const v = Number(durText.replace(/\D/g, ''))
    cfg = normalize({ ...cfg, durSec: Number.isFinite(v) && v ? v : cfg.durSec })
    durText = String(cfg.durSec)
  }
  function setDur(sec: number) {
    cfg = { ...cfg, durSec: sec }
    durText = String(sec)
  }

  function reset() {
    cfg = defaults()
    durText = String(cfg.durSec)
    open = null
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}></div>

<div class="panel" role="dialog" aria-label="settings">
  <div class="tabs">
    {#each OPS as op (op)}
      <div class="tab" class:on={enabled(op)} class:open={open === op}>
        <button
          class="glyph num"
          aria-pressed={enabled(op)}
          title="{enabled(op) ? 'turn off' : 'turn on'} {OP_NAME[op]}"
          onclick={() => toggle(op)}
        >
          {GLYPH[op]}
        </button>
        <button
          class="caret"
          aria-expanded={open === op}
          aria-label="{OP_NAME[op]} range"
          title="range of values"
          onclick={() => (open = open === op ? null : op)}
        >
          ▾
        </button>
      </div>
    {/each}
  </div>

  {#if open}
    {@const cur = open}
    {@const r = cfg.ranges[cur]}
    <div class="drop">
      <div class="drop-head">
        <span>{OP_NAME[cur]}</span>
        {#if !enabled(cur)}<span class="off">off</span>{/if}
      </div>
      <div class="range num">
        {#each [0, 1, 2, 3] as k (k)}
          {#if k === 2}
            <span class="op">{cur === 'add' || cur === 'sub' ? '+' : '×'}</span>
          {:else if k === 1 || k === 3}
            <span class="to">to</span>
          {/if}
          <input
            value={r[k]}
            oninput={(e) => setTerm(cur, k, e.currentTarget.value)}
            onblur={() => (cfg = normalize(cfg))}
            inputmode="numeric"
            aria-label="{k < 2 ? 'first' : 'second'} term, {k % 2 ? 'high' : 'low'}"
          />
        {/each}
      </div>
      {#if cur === 'sub' || cur === 'div'}
        <p class="note">
          asked backwards — {cur === 'sub'
            ? 'a + b is shown as (a+b) − a'
            : 'a × b is shown as (a×b) ÷ a'}, so the answer stays a whole number.
        </p>
      {/if}
    </div>
  {/if}

  <div class="row">
    <span class="label">time</span>
    <div class="times">
      {#each TIMES as t (t)}
        <button class="chip num" class:on={cfg.durSec === t} onclick={() => setDur(t)}>
          {fmtDur(t)}
        </button>
      {/each}
      <input
        class="secs num"
        bind:value={durText}
        onblur={commitDur}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        inputmode="numeric"
        aria-label="seconds"
      />
      <span class="unit">s</span>
    </div>
  </div>

  <div class="foot">
    <span class="hint">
      {#if live}applies to your next run{:else if !isDefault(cfg)}custom — you will only match others on these exact settings{:else}the standard setup{/if}
    </span>
    <button class="link" onclick={reset} disabled={isDefault(cfg)}>restore defaults</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
  }
  .panel {
    position: absolute;
    top: 52px;
    right: 0;
    z-index: 21;
    width: 380px;
    max-width: calc(100vw - 32px);
    padding: 14px;
    background: var(--panel);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.28);
    text-align: left;
  }

  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .tab {
    display: flex;
    align-items: stretch;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 140ms ease, background 140ms ease;
  }
  .tab.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .tab.open {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .glyph {
    flex: 1;
    height: 38px;
    font-size: 18px;
    color: var(--faint);
    transition: color 140ms ease;
  }
  .tab.on .glyph {
    color: var(--accent);
  }
  .caret {
    width: 22px;
    font-size: 10px;
    color: var(--faint);
    border-left: 1px solid var(--line);
    transition: color 140ms ease, transform 140ms ease;
  }
  .caret:hover {
    color: var(--text);
  }
  .tab.open .caret {
    color: var(--text);
    transform: rotate(180deg);
  }

  .drop {
    margin-top: 8px;
    padding: 10px 12px;
    background: var(--grid);
    border-radius: 8px;
  }
  .drop-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: 8px;
  }
  .drop-head .off {
    color: var(--danger);
    letter-spacing: 0;
    text-transform: none;
  }
  .range {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .range input {
    width: 100%;
    min-width: 0;
    height: 32px;
    text-align: center;
    font-size: 14px;
    background: var(--panel);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    outline: none;
    transition: border-color 140ms ease;
  }
  .range input:focus {
    border-color: var(--accent);
  }
  .to {
    font-size: 11px;
    color: var(--faint);
    flex: none;
  }
  .op {
    font-size: 14px;
    color: var(--muted);
    padding: 0 2px;
    flex: none;
  }
  .note {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--faint);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .label {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    flex: none;
  }
  .times {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
  }
  .chip {
    height: 28px;
    padding: 0 9px;
    font-size: 12px;
    color: var(--muted);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
  }
  .chip:hover {
    color: var(--text);
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .secs {
    width: 46px;
    height: 28px;
    margin-left: auto;
    text-align: center;
    font-size: 12px;
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    outline: none;
  }
  .secs:focus {
    border-color: var(--accent);
  }
  .unit {
    font-size: 11px;
    color: var(--faint);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .hint {
    font-size: 11px;
    color: var(--faint);
    line-height: 1.4;
  }
  .link {
    flex: none;
    font-size: 11px;
    color: var(--muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 0;
  }
  .link:hover:not(:disabled) {
    color: var(--text);
  }
  .link:disabled {
    color: var(--faint);
    cursor: default;
    text-decoration: none;
  }

  @media (max-width: 520px) {
    .row {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }
    .times {
      width: 100%;
    }
  }
</style>
