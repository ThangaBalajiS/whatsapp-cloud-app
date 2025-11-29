type EventCallback = (data: any) => void;

class EventEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  subscribe(userId: string, callback: EventCallback): () => void {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set());
    }
    this.listeners.get(userId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(userId)?.delete(callback);
      if (this.listeners.get(userId)?.size === 0) {
        this.listeners.delete(userId);
      }
    };
  }

  emit(userId: string, event: string, data: any): void {
    const callbacks = this.listeners.get(userId);
    if (callbacks) {
      callbacks.forEach((callback) => {
        callback({ event, data });
      });
    }
  }
}

// Global singleton
declare global {
  var eventEmitter: EventEmitter | undefined;
}

export const eventEmitter = global.eventEmitter || new EventEmitter();

if (process.env.NODE_ENV !== 'production') {
  global.eventEmitter = eventEmitter;
}

