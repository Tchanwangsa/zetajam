<script lang="ts">
  /**
   * The colour is what ties a name to a line on the graph. Seven pixels
   * everywhere except the roster, whose rows are taller — hence the one prop.
   */
  let { color, size = 7 }: { color: string; size?: number } = $props()
</script>

<span
  class="dot"
  style:background={color}
  style:width="{size}px"
  style:height="{size}px"
></span>

<style>
  .dot {
    border-radius: 50%;
    /* It is always a flex child, and it is the one thing in the row that must
       not give ground when the name beside it is too long. */
    flex: none;
  }
</style>
