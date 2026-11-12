import type { HTMLElement } from "node-html-parser";

interface ParsedHtmlEntry {
  body: HTMLElement;
  html: string;
  timestamp: number;
}

/** Bounded LRU of parsed documents; reads do not extend their absolute lifetime. */
export class ParsedHtmlCache {
  private readonly entries = new Map<string, ParsedHtmlEntry>();

  constructor(
    private readonly capacity = 100,
    private readonly ttl = 10 * 60 * 1000,
  ) {}

  clear() {
    this.entries.clear();
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now < entry.timestamp || now - entry.timestamp >= this.ttl)
        this.entries.delete(key);
    }
  }

  get(key: string) {
    this.prune();
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  remember(key: string, html: string, body: HTMLElement) {
    this.prune();
    this.entries.delete(key);
    this.entries.set(key, { body, html, timestamp: Date.now() });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
