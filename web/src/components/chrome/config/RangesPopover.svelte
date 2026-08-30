<script lang="ts">
  import {
    OPS,
    FORWARD,
    INVERSE_OF,
    GLYPH,
    OP_NAME,
    RUSH_SEC,
    RAMP_EVERY,
    RAMP_WIDE,
    RAMP_TOP,
    rushSlots,
    MAX_TERM,
    defaults,
    isDefault,
    rampLevel,
    rampStart,
    type Config,
    type Op,
    type Range,
  } from '../../../lib/config'
  import NumField from '../../ui/NumField.svelte'
  import Popover from '../../ui/Popover.svelte'

  /**
   * A panel rather than a fourth pill — typing four numbers per operation is
   * not done in passing — with the bar's switches redrawn as checkboxes so
   * turning division off need not close it. The tables say what the mode does:
   * rush leaves the ranges alone, ramp ignores them, both silent otherwise.
   */
  let {
    cfg,
    disabled = false,
    onChange,
    onToggle,
    onClose,
  }: {
    cfg: Config
    disabled?: boolean
    onChange: (c: Config) => void
    onToggle: (op: Op) => void
    onClose: () => void
  } = $props()

  const enabled = (op: Op) => cfg.ops.includes(op)

  function setTerm(op: Op, k: number, v: number) {
    const r = [...cfg.ranges[op]] as Range
    r[k] = v
    onChange({ ...cfg, ranges: { ...cfg.ranges, [op]: r } })
  }

  function reset() {
    onChange(defaults())
  }

  const std = $derived(isDefault(cfg))
  const ramp = $derived(cfg.mode === 'ramp')
  const rush = $derived(cfg.mode === 'rush')

  // Thirty levels is too many to print, so: a handful of readings off the
  // curve. Levels, not run length — the ramp does not scale to the clock.
  const PREVIEW = [1, 5, 10, RAMP_WIDE, RAMP_TOP]
  const rungs = PREVIEW.map((n) => ({ ...rampLevel(n), n, from: rampStart(n) }))
</script>

<Popover {onClose} label="operations and ranges" width={430}>
  <div class="ops">
    {#each OPS as op (op)}
      {@const from = INVERSE_OF[op]}
      <div class="oprow">
        <label class="check">
          <input type="checkbox" checked={enabled(op)} onchange={() => onToggle(op)} {disabled} />
          <span class="name">{OP_NAME[op]}</span>
        </label>

        {#if ramp}
          <!-- A ramp run draws off its own line — see the table below. -->
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

  {#if rush}
    <!-- Rush draws from the same ranges; what changes is who the question
         belongs to. A floor rather than a count: a question ends the moment
         somebody takes it, so a run fits more of them in. -->
    <div class="tiers num">
      <div class="micro head">rush — at {cfg.durSec}s</div>
      <div class="tier">
        <span class="at">{RUSH_SEC}s each</span>
        <span class="spec">
          {rushSlots(cfg.durSec)} questions at least
          <span class="dot">·</span>
          first correct answer takes the point and the room moves straight on
        </span>
      </div>
    </div>
  {/if}

  {#if ramp}
    <div class="tiers num">
      <div class="micro head">the ramp — a step every {RAMP_EVERY} questions</div>
      {#each rungs as t (t.n)}
        <div class="tier">
          <span class="at">lvl {t.n} · q{t.from + 1}</span>
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
    <button class="btn-link" onclick={reset} disabled={std || disabled}>restore defaults</button>
  </div>
</Popover>

<style>
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
    /* Wide enough for the longest label the ramp preview prints — the level
       and the question it opens on, both of which grow a digit. */
    width: 84px;
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
</style>
