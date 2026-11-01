/** Model-only queue: snapshots survive multiple simulation steps between frames. */
export class SoundEvents {
  constructor(limit = 96) { this.limit = limit; this.items = []; }

  emit(type, x, y, detail = {}) {
    if (this.items.length >= this.limit) this.items.shift();
    this.items.push({ ...detail, type, x, y });
  }

  take() {
    const items = this.items;
    this.items = [];
    return items;
  }
}
