import { NextResponse } from 'next/server';

import { ApiUrlNotConfiguredError } from './server-api-url';

const URL_PATTERN = /https?:\/\/\S+/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;
const IPV6_PATTERN = /\[[0-9a-f:]+\](?::\d{1,5})?/gi;
const HOST_PATTERN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?\b/gi;
const LOCALHOST_PATTERN = /\blocalhost(?::\d{1,5})?\b/gi;
const TOKEN_PATTERN = /\b(?:bearer\s+\S+|(?:access|refresh)?token=\S+)\b/gi;

/**
 * Removes URLs, addresses, and token-shaped text from a diagnostic string.
 * The client response does not use this text.
 */
export function redactDiagnostic(value: string): string {
  return value
    .replace(URL_PATTERN, '[redacted-url]')
    .replace(IPV4_PATTERN, '[redacted-address]')
    .replace(IPV6_PATTERN, '[redacted-address]')
    .replace(HOST_PATTERN, '[redacted-address]')
    .replace(LOCALHOST_PATTERN, '[redacted-address]')
    .replace(TOKEN_PATTERN, '[redacted-token]');
}

export function redactUrls(value: string): string {
  return redactDiagnostic(value);
}

/**
 * Client response for a proxy failure.
 * The body never includes the upstream URL, a token, or the raw exception text.
 * Server logs keep the error name and a redacted diagnostic, without document bytes.
 */
export function proxyExceptionResponse(error: unknown, operation: string): NextResponse {
  if (error instanceof ApiUrlNotConfiguredError) {
    console.error(`[CONFIG ERROR] API_URL is missing during ${operation}.`);
    return new NextResponse('API_URL is not configured.', { status: 500 });
  }

  const name = error instanceof Error ? error.name : 'Error';
  const detail = error instanceof Error ? redactDiagnostic(error.message) : 'unknown';
  console.error(`[PROXY ERROR] ${operation} failed: ${name}: ${detail}`);
  return new NextResponse('The requested file is temporarily unavailable.', { status: 502 });
}
