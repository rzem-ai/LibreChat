/**
 * Regression test for the Content-Length fix in
 * `@opentelemetry/otlp-exporter-base`'s Node HTTP transport
 * (applied via patches/@opentelemetry+otlp-exporter-base+*.patch, run by patch-package on postinstall).
 *
 * Failure mode this catches: chunked transfer encoding, which Azure Monitor's
 * DCR OTLP endpoint rejects with 400 MissingContentLengthHeader.
 *
 * We exercise the patched `compressAndSend` directly by requiring the internal
 * transport module from disk (bypassing the package's `exports` field), then
 * verify it calls `req.setHeader('Content-Length', <bytes>)` before piping.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

// The package's `exports` field blocks both `require('<pkg>/package.json')`
// and requiring submodules, so we walk `node_modules` by hand.
function findTransportUtilsPath(): string {
  let dir = __dirname;
  while (true) {
    const candidate = path.join(
      dir,
      'node_modules/@opentelemetry/otlp-exporter-base/build/src/transport/http-transport-utils.js',
    );
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        '@opentelemetry/otlp-exporter-base is not installed — cannot run Content-Length regression test',
      );
    }
    dir = parent;
  }
}

function findPatchPath(): string {
  let dir = __dirname;
  while (true) {
    const candidate = path.join(dir, 'patches/@opentelemetry+otlp-exporter-base+0.218.0.patch');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate @opentelemetry/otlp-exporter-base patch file');
    }
    dir = parent;
  }
}

const { compressAndSend } = require(findTransportUtilsPath()) as {
  compressAndSend: (
    req: any,
    compression: 'none' | 'gzip',
    data: Uint8Array,
    onError: (err: Error) => void,
  ) => void;
};

function makeFakeRequest() {
  const headers: Record<string, string | number> = {};
  const writes: Buffer[] = [];
  const sink = new PassThrough();
  // Collect written bytes as they arrive; when the source stream ends, resolve.
  const finished = new Promise<void>((resolve) => {
    sink.on('data', (chunk) => {
      writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    sink.on('finish', () => resolve());
  });
  const req = Object.assign(sink, {
    setHeader: jest.fn((k: string, v: string | number) => {
      headers[k] = v;
    }),
    getHeader: (k: string) =>
      headers[Object.keys(headers).find((h) => h.toLowerCase() === k.toLowerCase()) ?? k],
    getHeaders: () => headers,
  });
  return { req, headers, writes, finished };
}

describe('OTLP HTTP transport — Content-Length regression', () => {
  it('keeps the patch-package regression fix checked in', () => {
    const patch = fs.readFileSync(findPatchPath(), 'utf8');

    expect(patch).toContain("req.setHeader('Content-Length', payload.length)");
    expect(patch).toContain('zlib.gzipSync(data)');
  });

  it('sets Content-Length matching the raw payload byte length when compression is disabled', async () => {
    const { req, headers, writes, finished } = makeFakeRequest();
    const payload = Buffer.from('hello world otlp payload');
    const errors: Error[] = [];

    compressAndSend(req, 'none', payload, (err) => errors.push(err));
    await finished;

    expect(errors).toEqual([]);
    expect(req.setHeader).toHaveBeenCalledWith('Content-Length', payload.length);
    expect(headers['Content-Length']).toBe(payload.length);
    expect(Buffer.concat(writes)).toEqual(payload);
  });

  it('sets Content-Length matching the compressed byte length when compression is gzip', async () => {
    const { req, headers, writes, finished } = makeFakeRequest();
    const payload = Buffer.from('hello world otlp payload');
    const errors: Error[] = [];

    compressAndSend(req, 'gzip', payload, (err) => errors.push(err));
    await finished;

    expect(errors).toEqual([]);
    expect(req.setHeader).toHaveBeenCalledWith('Content-Encoding', 'gzip');
    // Content-Length is set to the length of the gzipped bytes, not the raw payload.
    const bytesSent = Buffer.concat(writes);
    expect(bytesSent.length).toBeGreaterThan(0);
    expect(headers['Content-Length']).toBe(bytesSent.length);
    // Round-trip: gunzipping the bytes we wrote should give back the original.
    const zlib = require('node:zlib');
    expect(zlib.gunzipSync(bytesSent)).toEqual(payload);
  });

  it('never falls back to chunked transfer encoding (Content-Length is always set)', () => {
    const { req } = makeFakeRequest();
    compressAndSend(req, 'none', Buffer.from('x'), () => undefined);
    const calls = (req.setHeader as jest.Mock).mock.calls.map((c) => c[0].toLowerCase());
    expect(calls).toContain('content-length');
  });
});
