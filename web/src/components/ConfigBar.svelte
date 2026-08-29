<script lang="ts">
  import {
    OPS,
    FORWARD,
    INVERSE_OF,
    GLYPH,
    OP_NAME,
    TIMES,
    MAX_TERM,
    MIN_DUR,
    MAX_DUR,
    defaults,
    normalize,
    isDefault,
    type Config,
    type Op,
    type Range,
  } from '../lib/config'
  import NumField from './ui/NumField.svelte'
  import Popover from './ui/Popover.svelte'
  import { Wrench } from '@lucide/svelte';

  /**
   * The settings, as a toolbar rather than a modal you have to finish with.
   *
   * Every control is one click from wherever you are — including mid-run,
   * which is the point: you find out a setting is wrong by playing under it,
   * and having to stop, open a panel and close it again is how a setting stays
   * wrong. `disabled` is for the two cases where changing it would be unfair to
   * somebody else: a versus match already in progress, and a room you are not
   * the host of.
   */
  let {
    cfg,
    onChange,
    disabled = false,
    note = '',
  }: {
    cfg: Config
    onChange: (c: Config) => void
    disabled?: boolean
    note?: string
  } = $props()

  let showRanges = $state(false)
  // The seconds box shows either because you asked for it or because the
  // length in force is not one of the presets — which is how a room member
  // sees the odd number the host typed.
  let wantCustom = $state(false)
  const custom = $derived(wantCustom || !TIMES.includes(cfg.durSec))

  const enabled = (op: Op) => cfg.ops.includes(op)
  const update = (next: Config) => onChange(normalize(next))

  function toggle(op: Op) {
    if (disabled) return
    const next = OPS.filter((o) => (o === op ? !enabled(op) : enabled(o))) as Op[]
    if (!next.length) return // one operation always has to stay on
    update({ ...cfg, ops: next })
  }

  function setDur(sec: number) {
    if (disabled) return
    if (TIMES.includes(sec)) wantCustom = false // typed your way back to a preset
    update({ ...cfg, durSec: sec })
  }

  function pickPreset(sec: number) {
    wantCustom = false
    setDur(sec)
  }

  function setTerm(op: Op, k: number, v: number) {
    const r = [...cfg.ranges[op]] as Range
    r[k] = v
    update({ ...cfg, ranges: { ...cfg.ranges, [op]: r } })
  }

  function reset() {
    wantCustom = false
    update(defaults())
  }

  const std = $derived(isDefault(cfg))
</script>

<div class="wrap">
  <div class="bar num" class:off={disabled}>
    <div class="group" role="group" aria-label="operations">
      {#each OPS as op (op)}
        <button
          class="item glyph"
          class:on={enabled(op)}
          aria-pressed={enabled(op)}
          title="{enabled(op) ? 'turn off' : 'turn on'} {OP_NAME[op]}"
          onclick={() => toggle(op)}
          {disabled}
        >
          {GLYPH[op]}
        </button>
      {/each}
      <button
        class="item"
        class:on={showRanges}
        aria-expanded={showRanges}
        onclick={() => (showRanges = !showRanges)}
      >
        <Wrench size={12} />
      </button>
    </div>

    <span class="sep" aria-hidden="true"></span>

    <div class="group" role="group" aria-label="match length">
      {#each TIMES as t (t)}
        <button
          class="item"
          class:on={!custom && cfg.durSec === t}
          onclick={() => pickPreset(t)}
          {disabled}
        >
          {t}
        </button>
      {/each}
      <button
        class="item"
        class:on={custom}
        aria-pressed={custom}
        onclick={() => (wantCustom = true)}
        {disabled}
      >
        custom
      </button>
      {#if custom}
        <NumField
          value={cfg.durSec}
          onCommit={setDur}
          min={MIN_DUR}
          max={MAX_DUR}
          width={52}
          label="match length in seconds"
          autofocus={wantCustom}
          {disabled}
        />
        <span class="unit">s</span>
      {/if}
    </div>
  </div>

  {#if showRanges}
    <Popover onClose={() => (showRanges = false)} label="operations and ranges" width={430}>
      <div class="ops">
        {#each OPS as op (op)}
          {@const from = INVERSE_OF[op]}
          <div class="oprow">
            <label class="check">
              <input
                type="checkbox"
                checked={enabled(op)}
                onchange={() => toggle(op)}
                {disabled}
              />
              <span class="name">{OP_NAME[op]}</span>
            </label>

            {#if FORWARD.includes(op)}
              <div class="range num">
                <span class="lead">Range:</span>
                <span class="paren">(</span>
                <NumField
                  value={cfg.ranges[op][0]}
                  onCommit={(v) => setTerm(op, 0, v)}
                  max={MAX_TERM}
                  width={54}
                  label="{OP_NAME[op]} first term, low"
                  {disabled}
                />
                <span class="to">to</span>
                <NumField
                  value={cfg.ranges[op][1]}
                  onCommit={(v) => setTerm(op, 1, v)}
                  max={MAX_TERM}
                  width={54}
                  label="{OP_NAME[op]} first term, high"
                  {disabled}
                />
                <span class="paren">)</span>
                <span class="glyph-sm">{GLYPH[op]}</span>
                <span class="paren">(</span>
                <NumField
                  value={cfg.ranges[op][2]}
                  onCommit={(v) => setTerm(op, 2, v)}
                  max={MAX_TERM}
                  width={54}
                  label="{OP_NAME[op]} second term, low"
                  {disabled}
                />
                <span class="to">to</span>
                <NumField
                  value={cfg.ranges[op][3]}
                  onCommit={(v) => setTerm(op, 3, v)}
                  max={MAX_TERM}
                  width={54}
                  label="{OP_NAME[op]} second term, high"
                  {disabled}
                />
                <span class="paren">)</span>
              </div>
            {:else if from}
              <p class="derived">{OP_NAME[from]} problems in reverse.</p>
            {/if}
          </div>
        {/each}
      </div>

      <div class="foot">
        <button class="btn-link" onclick={reset} disabled={std || disabled}>
          restore defaults
        </button>
      </div>
    </Popover>
  {/if}

  {#if note && !showRanges}
    <p class="note">{note}</p>
  {/if}
</div>

<style>
  .wrap {
    position: relative; /* the ranges popover anchors here */
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px;
    padding: 5px 8px;
    border-radius: 999px;
    background: var(--grid);
    font-size: 13px;
    transition: opacity 140ms ease;
  }
  .bar.off {
    opacity: 0.65;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 8px;
    background: var(--line);
  }

  .item {
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    color: var(--muted);
    line-height: 1;
    transition: color 120ms ease, background 120ms ease;
  }
  .item:hover:not(:disabled) {
    color: var(--text);
  }
  .item.on {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .item:disabled {
    cursor: default;
  }

  .glyph {
    font-size: 15px;
    min-width: 32px;
  }
  .unit {
    font-size: 11px;
    color: var(--faint);
    padding-left: 2px;
  }

  .note {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--faint);
  }

  /* --- the ranges panel --- */

  .ops {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .oprow {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
  }
  .check input {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .name {
    text-transform: capitalize;
  }

  .range,
  .derived {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 0 23px;
    font-size: 13px;
    color: var(--muted);
    flex-wrap: wrap;
  }
  .lead {
    margin-right: 2px;
  }
  .paren {
    color: var(--faint);
  }
  .to,
  .glyph-sm {
    font-size: 12px;
    color: var(--faint);
    padding: 0 1px;
  }
  .glyph-sm {
    font-size: 14px;
    color: var(--muted);
  }
  .derived {
    color: var(--faint);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  
  @media (max-width: 560px) {
    .sep {
      margin: 0 4px;
    }
    .item {
      padding: 0 8px;
    }
  }
</style>
