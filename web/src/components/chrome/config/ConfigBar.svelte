<script lang="ts">
  import { OPS, normalize, type Config, type Op } from '../../../lib/config'
  import ModeBlock from './ModeBlock.svelte'
  import OpsBlock from './OpsBlock.svelte'
  import LengthBlock from './LengthBlock.svelte'
  import RangesPopover from './RangesPopover.svelte'

  /**
   * A toolbar rather than a modal you have to finish with: every control one
   * click away, including mid-run — you find out a setting is wrong by playing
   * under it. `disabled` covers the two unfair cases, a versus match in progress
   * and a room you do not host. What a block hands back goes through `normalize`.
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

  const update = (next: Config) => onChange(normalize(next))

  const enabled = (op: Op) => cfg.ops.includes(op)

  // The bar's glyphs and the panel's checkboxes are the same four switches
  // drawn twice, so this handler cannot follow its markup into a child.
  function toggle(op: Op) {
    if (disabled) return
    const next = OPS.filter((o) => (o === op ? !enabled(op) : enabled(o))) as Op[]
    if (!next.length) return // one operation always has to stay on
    update({ ...cfg, ops: next })
  }
</script>

<div class="wrap">
  <div class="bar num" class:off={disabled}>
    <ModeBlock {cfg} {disabled} onChange={update} />

    <OpsBlock
      {cfg}
      {disabled}
      open={showRanges}
      onOpen={() => (showRanges = !showRanges)}
      onToggle={toggle}
    />

    <LengthBlock {cfg} {disabled} onChange={update} />
  </div>

  {#if showRanges}
    <RangesPopover
      {cfg}
      {disabled}
      onChange={update}
      onToggle={toggle}
      onClose={() => (showRanges = false)}
    />
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

  .note {
    margin: 8px 0 0;
  }

  @media (max-width: 560px) {
    .bar {
      gap: 6px;
    }
  }
</style>
