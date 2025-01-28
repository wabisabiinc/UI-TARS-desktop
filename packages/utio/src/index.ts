import { EventPayload, EventType } from './types';

export type { EventPayload as UTIOPayload };

export class UTIO {
  constructor(private readonly endpoint: string) {}

  async send<T extends EventType>(data: EventPayload<T>): Promise<void> {
    if (!this.endpoint) return;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`UTIO upload failed with status: ${response.status}`);
      }
    } catch (error) {
      // Silent fail
    }
  }
}
