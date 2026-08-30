<script lang="ts">
  /**
   * A dot breathing next to a sentence about waiting: nothing is stuck,
   * somebody else has not arrived yet. Both places that wait use it, which is
   * why the animation is in one file.
   */
</script>

<span class="pulse"></span>

<style>
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: breathe 1.6s ease-in-out infinite;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.25;
    }
    50% {
      opacity: 1;
    }
  }
</style>
