/** Tracks overlapping requests without retaining completed request keys. */
export class RequestRevisions {
  private readonly states = new Map<
    string,
    { latest: number; active: number }
  >();
  private nextRevision = 0;

  start(key: string, scopeCurrent: () => boolean) {
    const state = this.states.get(key) || { latest: 0, active: 0 };
    const revision = ++this.nextRevision;
    state.latest = revision;
    state.active++;
    this.states.set(key, state);
    let finished = false;
    return {
      current: () => state.latest === revision && scopeCurrent(),
      finish: () => {
        if (finished) return;
        finished = true;
        state.active--;
        if (state.active === 0 && this.states.get(key) === state)
          this.states.delete(key);
      },
    };
  }
}
