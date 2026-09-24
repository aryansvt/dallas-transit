import { afterEach, expect, it, vi } from 'vitest';
import { graphql, queryOtp } from './otp.js';
import { corpus } from './corpus.js';

afterEach(() => vi.unstubAllGlobals());
const plan = {
  data: {
    plan: { itineraries: [], routingErrors: [], searchWindowUsed: 7200 },
  },
};

it('maps >24:00 to the next civil date and applies the pinned boarding-limit translation', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(plan)));
  vi.stubGlobal('fetch', fetch);
  await queryOtp(
    'http://localhost/otp',
    corpus.find((c) => c.id === 'after-midnight')!,
  );
  const request = JSON.parse(fetch.mock.calls[0]![1].body as string) as {
    variables: Record<string, unknown>;
  };
  expect(request.variables).toMatchObject({
    date: '2026-09-19',
    time: '00:00:00',
    maxTransfers: 1,
    from: 'dart:33286',
    to: 'dart:15842',
  });
});

it('never turns HTTP, GraphQL, transport, or input errors into no-journey evidence', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('down', { status: 503 })),
  );
  await expect(graphql('http://localhost/otp', '{}')).rejects.toThrow(
    'HTTP 503',
  );
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ message: 'bad query' }] })),
      ),
  );
  await expect(graphql('http://localhost/otp', '{}')).rejects.toThrow(
    'GraphQL',
  );
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
  await expect(graphql('http://localhost/otp', '{}')).rejects.toThrow(
    'network',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            plan: {
              ...plan.data.plan,
              routingErrors: [
                { code: 'OUTSIDE_SERVICE_PERIOD', description: 'Wrong date' },
              ],
            },
          },
        }),
      ),
    ),
  );
  await expect(queryOtp('http://localhost/otp', corpus[0]!)).rejects.toThrow(
    'OUTSIDE_SERVICE_PERIOD',
  );
});

it('accepts an explicit no-transit result but preserves its reason', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            plan: {
              ...plan.data.plan,
              routingErrors: [
                {
                  code: 'NO_TRANSIT_CONNECTION',
                  description: 'No connection',
                },
              ],
            },
          },
        }),
      ),
    ),
  );
  const result = await queryOtp('http://localhost/otp', corpus[0]!);
  expect(result.itineraries).toEqual([]);
  expect(result.routingErrors[0]?.code).toBe('NO_TRANSIT_CONNECTION');
});
