import { expect, it } from 'vitest';
import { databaseConnection } from './connection.js';

it('uses local plaintext, private Render TLS and externally verified TLS explicitly', () => {
  expect(databaseConnection('postgres://localhost/db').ssl).toBe(false);
  expect(
    databaseConnection('postgres://u:p@dpg-example-a/db?sslmode=require'),
  ).toMatchObject({ ssl: { rejectUnauthorized: false } });
  const external = databaseConnection(
    'postgres://u:p@dpg-example-a.ohio-postgres.render.com/db?sslmode=require',
  );
  expect(external.ssl).toEqual({ rejectUnauthorized: true });
  expect(external.connectionString).not.toContain('sslmode');
  expect(
    databaseConnection('postgres://u:p@db.example.com/db?sslmode=verify-full')
      .ssl,
  ).toEqual({ rejectUnauthorized: true });
});
it.each([
  'https://host/db',
  'postgres://host/',
  'postgres://host/db?sslmode=disable',
  'postgres://host/db?sslmode=no-verify',
  'postgres://host/db?sslmode=require&sslmode=disable',
  'postgres://host/db?sslcert=secret',
  'postgres://dpg-example-a/db?sslmode=verify-full',
])('rejects unsafe settings without credentials: %s', (url) => {
  expect(() => databaseConnection(url)).toThrow('DATABASE_URL');
  expect(() => databaseConnection(url)).not.toThrow('secret');
});
