<script lang="ts">
  /**
   * Its own file because the squiggle is not really markup: a path with its
   * dash offset walked to zero on a keyframe, plus the reduced-motion hatch
   * that leaves it already drawn.
   */
</script>

<!-- The header's wordmark says what the app is called; this says what you are
     about to do. Lobby only — every other screen has a run in it. -->
<h1 class="welcome">
  welcome to
  <span class="mark">
    zetajam
    <svg class="squiggle" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M2 6.4 C 14 2.2, 24 8.6, 36 5.2 S 58 1.8, 70 6 S 94 8.4, 118 3.4"
        pathLength="1"
      />
    </svg>
  </span>
</h1>
<p class="sub">zetamac mental arithmetic head to head duels with friends!</p>

<style>
  .welcome {
    margin: 0;
    /* Two lines on a phone is fine; three is a page of nothing but greeting. */
    font-size: clamp(28px, 5.2vw, 40px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  /* The underline is drawn under the word rather than through the text box, so
     it stays put whatever the line-height does. */
  .mark {
    position: relative;
    white-space: nowrap;
    color: var(--accent);
  }
  .squiggle {
    position: absolute;
    left: 0;
    top: 100%;
    width: 100%;
    height: 10px;
    margin-top: -2px;
    overflow: visible;
  }
  .squiggle path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linecap: round;
    opacity: 0.7;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: underline 520ms ease-out 220ms forwards;
  }
  @keyframes underline {
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .squiggle path {
      stroke-dashoffset: 0;
    }
  }

  .sub {
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 15px;
  }
</style>
