<script lang="ts">
  import { OPS, GLYPH, OP_NAME, type Config, type Op } from '../../../lib/config'
  import Block from './Block.svelte'
  import Chip from './Chip.svelte'
  import { Wrench } from '@lucide/svelte'

  /**
   * Turning an operation off — division, mostly — is constant, so the glyphs
   * stay out here and only the ranges live behind the wrench. The wrench is
   * never disabled: the panel is worth reading in somebody else's room, and
   * disables itself inside. The bar draws it, hence `open` as a prop.
   */
  let {
    cfg,
    disabled = false,
    open,
    onOpen,
    onToggle,
  }: {
    cfg: Config
    disabled?: boolean
    open: boolean
    onOpen: () => void
    onToggle: (op: Op) => void
  } = $props()

  const enabled = (op: Op) => cfg.ops.includes(op)
</script>

<Block label="operations">
  {#each OPS as op (op)}
    <Chip
      variant="glyph"
      on={enabled(op)}
      pressed={enabled(op)}
      title="{enabled(op) ? 'turn off' : 'turn on'} {OP_NAME[op]}"
      onclick={() => onToggle(op)}
      {disabled}
    >
      {GLYPH[op]}
    </Chip>
  {/each}
  <Chip
    on={open}
    expanded={open}
    label="operations and ranges"
    title="operations and ranges"
    onclick={onOpen}
  >
    <Wrench size={13} />
  </Chip>
</Block>
