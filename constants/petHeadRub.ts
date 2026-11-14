/** Hysteresis ignores tiny finger jitters; happiness needs a real back-and-forth rub. */
export function createHeadRubTracker(minStroke = 14) {
  let peak = 0, direction = 0, turns = 0;
  return {
    reset() { peak = 0; direction = 0; turns = 0; },
    move(x: number) {
      if (!Number.isFinite(x)) return false;
      if (!direction) {
        if (Math.abs(x-peak) >= minStroke) { direction = Math.sign(x-peak); peak = x; }
        return false;
      }
      if ((x-peak)*direction >= 0) { peak = x; return false; }
      if (Math.abs(x-peak) < minStroke) return false;
      direction *= -1; peak = x; turns++;
      if (turns < 2) return false;
      turns = 0;
      return true;
    },
  };
}
