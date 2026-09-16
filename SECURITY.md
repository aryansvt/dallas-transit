# Security Policy

## Reporting

Do not open a public issue for a vulnerability that would expose secrets, infrastructure access, or user-sensitive information.

A private reporting contact will be added before production launch.

## Current scope

The project is pre-production and V1 intentionally avoids user accounts.

Security still matters around:
- database credentials
- Redis credentials
- deployment tokens
- external API keys
- feed ingestion
- public API abuse
- dependency vulnerabilities

## Secrets

Never commit:
- `.env`
- access tokens
- private keys
- database passwords
- deployment credentials

Commit `.env.example` files with placeholder names only.

## Supported versions

Until the first stable release, only the latest `main` branch is actively maintained.
