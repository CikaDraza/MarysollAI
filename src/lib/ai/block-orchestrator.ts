import { aiLog } from "./debug-log";

const log = aiLog("BLOCK_ORCHESTRATOR");

export interface ActiveBlock {
  type: string;
  visible: boolean;
  mountedAt: number;
}

class BlockOrchestrator {
  private static instance: BlockOrchestrator;
  private registry = new Map<string, ActiveBlock>();
  private listeners = new Set<() => void>();

  private constructor() {}

  static getInstance(): BlockOrchestrator {
    if (!BlockOrchestrator.instance) {
      BlockOrchestrator.instance = new BlockOrchestrator();
    }
    return BlockOrchestrator.instance;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  isBlockOpen(type: string): boolean {
    return this.registry.get(type)?.visible ?? false;
  }

  openBlock(type: string): void {
    const wasOpen = this.isBlockOpen(type);
    this.registry.set(type, { type, visible: true, mountedAt: Date.now() });
    this.notify();
    if (!wasOpen) log("open", { type });
    else log("open.duplicate_suppressed", { type });
  }

  closeBlock(type: string): void {
    const entry = this.registry.get(type);
    if (entry) {
      this.registry.set(type, { ...entry, visible: false });
      this.notify();
      log("close", { type });
    }
  }

  toggleBlock(type: string): void {
    this.isBlockOpen(type) ? this.closeBlock(type) : this.openBlock(type);
  }

  /**
   * Bring an already-mounted block into view instead of re-rendering it.
   * Used by the AI orchestrator when the model requests a block that's
   * already on screen (e.g. user clicks Login twice while LoginBlock is open).
   * Looks up by `data-block-type` attribute set by the block factory.
   */
  focusBlock(type: string): boolean {
    if (typeof document === "undefined") return false;
    if (!this.isBlockOpen(type)) return false;

    const el = document.querySelector<HTMLElement>(`[data-block-type="${type}"]`);
    if (!el) return false;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("block-focus-pulse");
    // Auto-remove the class so subsequent focus calls re-trigger the animation.
    // setTimeout cleared on subsequent focuses by overwriting the same class.
    setTimeout(() => el.classList.remove("block-focus-pulse"), 1200);
    log("focus", { type });
    return true;
  }

  clear(): void {
    this.registry.clear();
    this.notify();
  }
}

export const blockOrchestrator = BlockOrchestrator.getInstance();
