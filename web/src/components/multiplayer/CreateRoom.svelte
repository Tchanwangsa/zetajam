<script lang="ts">
  import Segmented from '../ui/Segmented.svelte'
  import { VISIBILITY } from '../ui/visibility'

  /**
   * The answer is remembered across visits, and the remembering lives here
   * beside the control — the screen is told what the room will be once, when
   * the button is pressed.
   */
  let { onCreate }: { onCreate: (isPublic: boolean) => void } = $props()

  // What the next room you make will be. Whoever runs public rooms runs
  // public rooms.
  let isPublic = $state(localStorage.getItem('zetajam.public') !== '0')
  $effect(() => localStorage.setItem('zetajam.public', isPublic ? '1' : '0'))
</script>

<div class="card surface">
  <div class="micro">start one</div>
  <!-- The toggle is above the button rather than inside a settings panel:
       it changes what the button makes, so it has to be read first. -->
  <Segmented
    value={isPublic}
    options={VISIBILITY}
    onSelect={(v) => (isPublic = v)}
    label="who can join"
  />
  <p>
    {isPublic
      ? 'Listed below for anyone to join. You host, you set the rules.'
      : 'Reachable only by its code. Share the link with friends.'}
  </p>
  <button class="btn btn-primary" onclick={() => onCreate(isPublic)}>create a room</button>
</div>

<style>
  /* Nothing else on either card wants the full width — the join button next
     door pointedly does not — so the rule stays with the one button. */
  .card .btn {
    width: 100%;
  }
</style>
