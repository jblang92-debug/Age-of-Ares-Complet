// Simulation à pas fixe (100 ms), séparée du rendu. Le rendu interpole avec `alpha`.
export const TICK_MS = 100;

export class FixedClock {
  tick = 0;
  private acc = 0;
  constructor(private step: (tick: number) => void) {}
  /** Avance la simulation ; renvoie alpha (0..1) pour l'interpolation du rendu. */
  advance(dtMs: number): number {
    this.acc += Math.min(dtMs, 250);
    while (this.acc >= TICK_MS) { this.acc -= TICK_MS; this.step(this.tick++); }
    return this.acc / TICK_MS;
  }
}
