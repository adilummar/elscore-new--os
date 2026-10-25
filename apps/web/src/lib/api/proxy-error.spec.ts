/**
 * @jest-environment node
 */
import { cookies } from 'next/headers';

import { GET as downloadDocument } from '../../app/api/onboarding/[caseId]/documents/[docId]/download/route';
import { GET as downloadQuotationPdf } from '../../app/api/quotations/[id]/pdf/route';
import { proxyExceptionResponse, redactUrls } from './proxy-error';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

const INTERNAL_URL = 'http://api.internal.example/api/v1/onboarding/cases/case-1/documents/doc-1/download';

function withSession() {
  (cookies as unknown as jest.Mock).mockReturnValue({
    get: (name: string) => (name === 'accessToken' ? { value: 'session-token' } : undefined),
  });
}

describe('proxyExceptionResponse', () => {
  it('redacts URLs and does not return them to the client', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = proxyExceptionResponse(
      new Error(`connect failed ${INTERNAL_URL}`),
      'document download',
    );

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toBe('The requested file is temporarily unavailable.');
    expect(body).not.toContain('internal.example');
    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('[redacted-url]');
    expect(logged).not.toContain('internal.example');
    expect(logged).not.toContain('session-token');
    errorSpy.mockRestore();
  });

  it('redacts every URL in a message', () => {
    expect(redactUrls(`a ${INTERNAL_URL} b`)).toBe('a [redacted-url] b');
  });

  it('redacts connection addresses and tokens from the log', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = proxyExceptionResponse(
      new Error('connect ECONNREFUSED 10.1.2.3:3001 bearer session-token api.internal:3001'),
      'quotation PDF download',
    );

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toBe('The requested file is temporarily unavailable.');
    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain('10.1.2.3');
    expect(logged).not.toContain('session-token');
    expect(logged).not.toContain('api.internal');
    expect(logged).toContain('[redacted-address]');
    expect(logged).toContain('[redacted-token]');
    errorSpy.mockRestore();
  });

  it('redacts bare localhost:3001 and localhost addresses from logs', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = proxyExceptionResponse(
      new Error('connect ECONNREFUSED localhost:3001 and loopback localhost'),
      'document download',
    );

    expect(response.status).toBe(502);
    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain('localhost:3001');
    expect(logged).not.toContain('localhost');
    expect(logged).toContain('[redacted-address]');
    errorSpy.mockRestore();
  });
});

describe('file proxy routes', () => {
  const originalUrl = process.env.API_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    withSession();
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalUrl;
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('returns 401 and does not fetch when the session is missing', async () => {
    (cookies as unknown as jest.Mock).mockReturnValue({ get: () => undefined });
    const fetchMock = jest.spyOn(global, 'fetch');

    const response = await downloadDocument({} as never, {
      params: { caseId: 'case-1', docId: 'doc-1' },
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when production API_URL is missing', async () => {
    delete process.env.API_URL;
    process.env.NODE_ENV = 'production';
    const fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const documentResponse = await downloadDocument({} as never, {
      params: { caseId: 'case-1', docId: 'doc-1' },
    });
    const pdfResponse = await downloadQuotationPdf({} as never, { params: { id: 'quo-1' } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(documentResponse.status).toBe(500);
    expect(pdfResponse.status).toBe(500);
    expect(await documentResponse.text()).toBe('API_URL is not configured.');
    expect(await pdfResponse.text()).not.toMatch(/localhost|internal\.example|session-token/i);
  });

  it('preserves an upstream status without including the API URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'http://api.internal.example/api/v1';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const response = await downloadQuotationPdf({} as never, { params: { id: 'quo-1' } });

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toBe('Backend returned 404');
    expect(body).not.toContain('internal.example');
  });

  it('hides a network exception from the client and from the log URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'http://api.internal.example/api/v1';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error(`socket hang up ${INTERNAL_URL}`));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await downloadDocument({} as never, {
      params: { caseId: 'case-1', docId: 'doc-1' },
    });

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toBe('The requested file is temporarily unavailable.');
    expect(body).not.toContain('internal.example');
    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain('internal.example');
    expect(logged).not.toContain('session-token');
  });

  it('delivers a PDF with private no-store headers', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'http://api.internal.example/api/v1';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-disposition'
            ? 'attachment; filename="Quotation.pdf"'
            : null,
      },
      arrayBuffer: async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer,
    } as Response);

    const response = await downloadQuotationPdf({} as never, { params: { id: 'quo-1' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('Quotation.pdf');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('sanitizes CRLF injection from upstream headers in onboarding document download', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'http://api.internal.example/api/v1';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          if (lower === 'content-type') return 'application/pdf\r\nX-Injected: evil';
          if (lower === 'content-disposition') return 'attachment; filename="doc.pdf"\r\nSet-Cookie: stolen=1';
          return null;
        },
      },
      arrayBuffer: async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer,
    } as Response);

    const response = await downloadDocument({} as never, {
      params: { caseId: 'case-1', docId: 'doc-1' },
    });

    expect(response.status).toBe(200);
    const contentType = response.headers.get('Content-Type');
    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentType).not.toMatch(/[\r\n]/);
    expect(contentDisposition).not.toMatch(/[\r\n]/);
    expect(contentType).toBe('application/pdfX-Injected: evil');
    expect(contentDisposition).toBe('attachment; filename="doc.pdf"Set-Cookie: stolen=1');
  });

  it('sanitizes CRLF injection from upstream headers in quotation PDF download', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'http://api.internal.example/api/v1';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          if (lower === 'content-type') return 'application/pdf\r\nInjected: evil';
          if (lower === 'content-disposition') return 'attachment; filename="Quotation.pdf"\r\nInjected: evil';
          return null;
        },
      },
      arrayBuffer: async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer,
    } as Response);

    const response = await downloadQuotationPdf({} as never, { params: { id: 'quo-1' } });

    expect(response.status).toBe(200);
    const contentType = response.headers.get('Content-Type');
    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentType).not.toMatch(/[\r\n]/);
    expect(contentDisposition).not.toMatch(/[\r\n]/);
  });
});
