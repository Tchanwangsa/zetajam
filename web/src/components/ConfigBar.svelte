<script lang="ts">
  import {
    OPS,
    FORWARD,
    INVERSE_OF,
    GLYPH,
    OP_NAME,
    MODES,
    TIERS,
    TIMES,
    MAX_TERM,
    MIN_DUR,
    MAX_DUR,
    defaults,
    normalize,
    isDefault,
    tierStart,
    type Config,
    type Mode,
    type Op,
    type Range,
  } from '../lib/config'
  import NumField from './ui/NumField.svelte'
  import Popover from './ui/Popover.svelte'
  import { Brain, Settings2, TrendingUp, Wrench } from '@lucide/svelte';

  /**
   * The settings, as a toolbar rather than a modal you have to finish with.
   *
   * Every control is one click from wherever you are — including mid-run,
   * which is the point: you find out a setting is wrong by playing under it,
   * and having to stop, open a panel and close it again is how a setting stays
   * wrong. `disabled` is for the two cases where changing it would be unfair to
   * somebody else: a versus match already in progress, and a room you are not
   * the host of.
   *
   * The three blocks are three separate questions — what kind of run, over
   * which operations, for how long — so they are three separate pills rather
   * than one long one with dividers in it. Nothing in a block changes what the
   * other blocks mean.
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

  const MODE_ICON = { classic: Brain, ramp: TrendingUp }
  const MODE_HINT: Record<Mode, string> = {
    classic: 'one difficulty the whole way',
    ramp: 'starts easy, steps up as the run goes on',
  }

  let showRanges = $state(false)
  let showDur = $state(false)
  // A length that is not one of the presets is a custom one, and there is
  // nothing else it could be — so the chip reads it off the config rather than
  // remembering that you opened the box, which is also how a room member sees
  // the odd number the host typed.
  const custom = $derived(!TIMES.includes(cfg.durSec))

  const enabled = (op: Op) => cfg.ops.includes(op)
  const update = (next: Config) => onChange(normalize(next))

  function setMode(mode: Mode) {
    if (disabled || cfg.mode === mode) return
    update({ ...cfg, mode })
  }

  function toggle(op: Op) {
    if (disabled) return
    const next = OPS.filter((o) => (o === op ? !enabled(op) : enabled(o))) as Op[]
    if (!next.length) return // one operation always has to stay on
    update({ ...cfg, ops: next })
  }

  // Typing a preset's own number is picking that preset — the chip lights up
  // and the custom one goes back to being an icon, because 60 typed and 60
  // clicked are the same run.
  function setDur(sec: number) {
    if (disabled) return
    update({ ...cfg, durSec: sec })
    showDur = false
  }

  function setTerm(op: Op, k: number, v: number) {
    const r = [...cfg.ranges[op]] as Range
    r[k] = v
    update({ ...cfg, ranges: { ...cfg.ranges, [op]: r } })
  }

  function reset() {
    update(defaults())
  }

  const std = $derived(isDefault(cfg))
  const ramp = $derived(cfg.mode === 'ramp')

  // The panel lists the rungs alongside the question each one starts at, which
  // is the only place the per-minute scaling is visible: at 15s the ramp is
  // over in three questions, at five minutes it takes fifty. At the very
  // shortest lengths two thresholds round to the same question and a rung is
  // skipped outright, which is why `from` is allowed to be null.
  const rungs = $derived(TIERS.map((t, k) => ({ ...t, from: tierStart(k, cfg.durSec) })))
</script>

<div class="wrap">
  <div class="bar num" class:off={disabled}>
    <div class="block" role="group" aria-label="mode">
      {#each MODES as m (m)}
        {@const Icon = MODE_ICON[m]}
        <button
          class="item mode"
          class:on={cfg.mode === m}
          aria-pressed={cfg.mode === m}
          title={MODE_HINT[m]}
          onclick={() => setMode(m)}
          {disabled}
        >
          <Icon size={13} />
          {m}
        </button>
      {/each}
    </div>

    <div class="block" role="group" aria-label="operations">
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
        aria-label="operations and ranges"
        title="operations and ranges"
        onclick={() => (showRanges = !showRanges)}
      >
        <Wrench size={13} />
      </button>
    </div>

    <div class="block" role="group" aria-label="match length">
      {#each TIMES as t (t)}
        <!-- Pressed rather than merely lit: a preset is a choice among four,
             and the lobby's pointer finds the chosen one by asking for it. -->
        <button
          class="item"
          class:on={cfg.durSec === t}
          aria-pressed={cfg.durSec === t}
          onclick={() => setDur(t)}
          {disabled}
        >
          {t}
        </button>
      {/each}
      <!-- The chip is its own anchor so the box drops under the icon rather
           than under the middle of the bar. -->
      <span class="anchor">
        <button
          class="item"
          class:on={custom}
          aria-pressed={custom}
          aria-expanded={showDur}
          aria-label={custom ? `match length, ${cfg.durSec} seconds` : 'custom match length'}
          title="custom match length"
          onclick={() => (showDur = !showDur)}
          {disabled}
        >
          {#if custom}
            {cfg.durSec}s
          {:else}
            <Settings2 size={13} />
          {/if}
        </button>

        {#if showDur}
          <Popover
            onClose={() => (showDur = false)}
            align="right"
            label="custom match length"
            width={196}
          >
            <div class="micro head">match length</div>
            <div class="dur num">
              <NumField
                value={cfg.durSec}
                onCommit={setDur}
                min={MIN_DUR}
                max={MAX_DUR}
                width={62}
                label="match length in seconds"
                autofocus
                {disabled}
              />
              <span class="secs">seconds · {MIN_DUR}–{MAX_DUR}</span>
            </div>
          </Popover>
        {/if}
      </span>
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

            {#if ramp}
              <!-- Ranges are the rungs' in a ramp run, so there is nothing here
                   to type into — see the tier table below. -->
            {:else if FORWARD.includes(op)}
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

      {#if ramp}
        <div class="tiers num">
          <div class="micro head">the ramp — at {cfg.durSec}s</div>
          {#each rungs as t, k (k)}
            <div class="tier">
              <span class="at">{t.from === null ? 'skipped' : `from q${t.from}`}</span>
              <span class="spec">
                {t.add[0]}–{t.add[1]} + {t.add[2]}–{t.add[3]}
                <span class="dot">·</span>
                {t.mul[0]}–{t.mul[1]} × {t.mul[2]}–{t.mul[3]}
              </span>
            </div>
          {/each}
        </div>
      {/if}

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
    gap: 32px;
    font-size: 13px;
    transition: opacity 140ms ease;
  }
  .bar.off {
    opacity: 0.65;
  }

  .block {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    border-radius: 999px;
    background: var(--grid);
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

  .mode {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .glyph {
    font-size: 15px;
    min-width: 32px;
  }

  /* Both popovers are absolute; this is what the length one hangs off. */
  .anchor {
    position: relative;
    display: inline-flex;
  }
  .dur {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .secs {
    font-size: 11px;
    color: var(--faint);
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

  .tiers {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .head {
    margin-bottom: 2px;
  }
  .tier {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 12px;
  }
  .at {
    flex: none;
    width: 62px;
    color: var(--faint);
  }
  .spec {
    color: var(--muted);
  }
  .dot {
    color: var(--faint);
    padding: 0 4px;
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
    .bar {
      gap: 6px;
    }
    .item {
      padding: 0 8px;
    }
  }
</style>
