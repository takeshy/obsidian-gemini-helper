// Simple browser-compatible EventEmitter with type-safe events
export interface EventMap {
  "settings-updated": [settings: unknown];
  "workspace-state-loaded": [state: unknown];
  "rag-setting-changed": [name: string | null];
  "chat-activated": [];
  "file-restored": [path: string];
  "execution-history-saved": [workflowPath: string];
}

type EventName = keyof EventMap;
type Listener<E extends EventName> = (...args: EventMap[E]) => void;

export class EventEmitter {
  private events: Map<EventName, Set<Listener<EventName>>> = new Map();

  on<E extends EventName>(event: E, listener: Listener<E>): this {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener as Listener<EventName>);
    return this;
  }

  off<E extends EventName>(event: E, listener: Listener<E>): this {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.delete(listener as Listener<EventName>);
    }
    return this;
  }

  emit<E extends EventName>(event: E, ...args: EventMap[E]): boolean {
    const listeners = this.events.get(event);
    if (!listeners || listeners.size === 0) {
      return false;
    }
    for (const listener of listeners) {
      listener(...args);
    }
    return true;
  }

  removeAllListeners(event?: EventName): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }
}

// Global event emitter for cross-component communication
export const globalEventEmitter = new EventEmitter();
