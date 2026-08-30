<script lang="ts">
  import { MODES, RAMP_EVERY, RAMP_TOP, type Config, type Mode } from '../../../lib/config'
  import Block from './Block.svelte'
  import Chip from './Chip.svelte'
  import { Brain, TrendingUp, Zap } from '@lucide/svelte'

  /**
   * `ramp` and `rush` are not words anybody can guess, so the sentence that
   * explains each is one hover away — printing them would make this a settings
   * page, and the reason it is a bar is that it is not one.
   */
  let {
    cfg,
    disabled = false,
    onChange,
  }: {
    cfg: Config
    disabled?: boolean
    onChange: (c: Config) => void
  } = $props()

  const MODE_ICON = { classic: Brain, ramp: TrendingUp, rush: Zap }
  const MODE_HINT: Record<Mode, string> = {
    classic: 'one difficulty the whole way',
    ramp: `opens easy and steps up every ${RAMP_EVERY} questions, ${RAMP_TOP} levels of it`,
    rush: `one question for everybody — first correct answer takes the point and moves the room on`,
  }

  function setMode(mode: Mode) {
    if (disabled || cfg.mode === mode) return
    onChange({ ...cfg, mode })
  }
</script>

<Block label="mode">
  {#each MODES as m (m)}
    {@const Icon = MODE_ICON[m]}
    <Chip
      variant="mode"
      on={cfg.mode === m}
      pressed={cfg.mode === m}
      title={MODE_HINT[m]}
      onclick={() => setMode(m)}
      {disabled}
    >
      <Icon size={13} />
      {m}
    </Chip>
  {/each}
</Block>
