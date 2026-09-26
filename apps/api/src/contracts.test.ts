import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { legSchema } from './contracts.js';
it('serializes pedestrian metadata without inventing it for legacy interchanges', async () => {
  const app = Fastify();
  const leg = {
    kind: 'transfer',
    transferId: 'test',
    fromStopId: 'a',
    toStopId: 'b',
    departureTime: 100,
    arrivalTime: 200,
  };
  app.get('/walk', { schema: { response: { 200: legSchema } } }, async () => ({
    ...leg,
    pedestrian: { distanceMeters: 120, provenance: 'synthetic' },
  }));
  app.get(
    '/legacy',
    { schema: { response: { 200: legSchema } } },
    async () => leg,
  );
  try {
    expect((await app.inject('/walk')).json()).toMatchObject({
      pedestrian: { distanceMeters: 120, provenance: 'synthetic' },
    });
    expect((await app.inject('/legacy')).json()).not.toHaveProperty(
      'pedestrian',
    );
  } finally {
    await app.close();
  }
});
