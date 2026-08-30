<script lang="ts">
  import { TIMES, MIN_DUR, MAX_DUR, type Config } from '../../../lib/config'
  import NumField from '../../ui/NumField.svelte'
  import Popover from '../../ui/Popover.svelte'
  import Block from './Block.svelte'
  import Chip from './Chip.svelte'
  import { Settings2 } from '@lucide/svelte'

  /**
   * How long a run lasts: four presets and a box for anything else. The fifth
   * chip stays an icon until it has something to say, then says the number —
   * a run of 95 seconds should be legible from the bar.
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

  let showDur = $state(false)
  // Read off the config rather than remembered from opening the box — which
  // is also how a room member sees the odd number the host typed.
  const custom = $derived(!TIMES.includes(cfg.durSec))

  // 60 typed and 60 clicked are the same run, so typing a preset's number
  // lights that preset and the custom chip goes back to an icon.
  function setDur(sec: number) {
    if (disabled) return
    onChange({ ...cfg, durSec: sec })
    showDur = false
  }
</script>

<Block label="match length">
  {#each TIMES as t (t)}
    <!-- Pressed rather than merely lit: a preset is a choice among four,
         and the lobby's pointer finds the chosen one by asking for it. -->
    <Chip on={cfg.durSec === t} pressed={cfg.durSec === t} onclick={() => setDur(t)} {disabled}>
      {t}
    </Chip>
  {/each}
  <!-- Its own anchor, so the box drops under the icon, not the bar's middle. -->
  <span class="anchor">
    <Chip
      on={custom}
      pressed={custom}
      expanded={showDur}
      label={custom ? `match length, ${cfg.durSec} seconds` : 'custom match length'}
      title="custom match length"
      onclick={() => (showDur = !showDur)}
      {disabled}
    >
      {#if custom}
        {cfg.durSec}s
      {:else}
        <Settings2 size={13} />
      {/if}
    </Chip>

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
</Block>

<style>
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
  .head {
    margin-bottom: 2px;
  }
</style>
