import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('service health', () => {
  it('serves health and readiness without database or cache connections', async () => {
    const app = buildApp();
    try {
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ status: 'ok' });

      const ready = await app.inject({ method: 'GET', url: '/ready' });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: 'ready' });
    } finally {
      await app.close();
    }
  });
});
