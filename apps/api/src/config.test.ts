import { describe, expect, it } from 'vitest';
import { readServerConfig } from './config.js';

describe('server configuration', () => {
  it('defaults to a loopback listener on port 3001', () => {
    expect(readServerConfig({})).toEqual({ host: '127.0.0.1', port: 3001 });
  });

  it('accepts explicit host and port overrides', () => {
    expect(readServerConfig({ HOST: '0.0.0.0', PORT: '4100' })).toEqual({
      host: '0.0.0.0',
      port: 4100,
    });
  });

  it.each(['', '0', '65536', '-1', '3.5', '3001oops', 'Infinity'])(
    'rejects invalid port %j',
    (port) => {
      expect(() => readServerConfig({ PORT: port })).toThrow(
        'PORT must be an integer',
      );
    },
  );

  it('rejects an empty host', () => {
    expect(() => readServerConfig({ HOST: ' ' })).toThrow(
      'HOST must not be empty',
    );
  });
});
