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
it('serializes per-boarding transfer risk only where the router set it', async () => {
  const app = Fastify();
  const ride = {
    kind: 'transit',
    tripId: 't',
    routeId: 'r',
    patternId: 'p',
    boardingStopId: 'a',
    boardingOccurrence: 0,
    boardingSequence: 1,
    alightingStopId: 'b',
    alightingOccurrence: 1,
    alightingSequence: 2,
    departureTime: 100,
    arrivalTime: 200,
  };
  app.get('/later', { schema: { response: { 200: legSchema } } }, async () => ({
    ...ride,
    scheduledTransferRisk: 120,
  }));
  app.get(
    '/first',
    { schema: { response: { 200: legSchema } } },
    async () => ride,
  );
  try {
    expect((await app.inject('/later')).json()).toMatchObject({
      scheduledTransferRisk: 120,
    });
    expect((await app.inject('/first')).json()).not.toHaveProperty(
      'scheduledTransferRisk',
    );
  } finally {
    await app.close();
  }
});
