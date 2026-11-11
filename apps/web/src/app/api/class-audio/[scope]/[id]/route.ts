import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { proxyExceptionResponse } from '@/lib/api/proxy-error';
import { resolveServerApiUrl } from '@/lib/api/server-api-url';

const ROUTES: Record<string, string> = { tutor: '/tutor-portal/class-workspace/audio', mentoring: '/mentoring/class-workspace/audio' };
const RANGE = /^bytes=\d*-\d*$/;

/**
 * Plays a class voice recording. The browser cannot send the sign-in token itself, so this passes the signed-in user's own
 * session on to the API, which decides whether that user may hear the recording. Nothing here picks a file path.
 * A player asks for parts of the file to start quickly and to seek; the Range header is passed on and the 200, 206 or 416 answer
 * comes back with its Content-Range and Accept-Ranges, so seeking works (Safari will not play audio without it).
 */
export async function GET(request: NextRequest, { params }: { params: { scope: string; id: string } }) {
  const token = cookies().get('accessToken')?.value;
  if (!token) return new NextResponse('Unauthorized', { status: 401 });
  const base = ROUTES[params.scope];
  if (!base || !/^[A-Za-z0-9_-]{8,64}$/.test(params.id)) return new NextResponse('Not found', { status: 404 });

  try {
    const godViewUserId = cookies().get('godViewUserId')?.value;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (godViewUserId) headers['X-God-View-Target'] = godViewUserId;
    const range = request.headers.get('range');
    if (range && RANGE.test(range.trim())) headers.Range = range.trim();
    const res = await fetch(`${resolveServerApiUrl()}${base}/${params.id}`, { method: 'GET', headers });

    if (res.status === 416) {
      const size = (res.headers.get('Content-Range') ?? '').replace(/[\r\n]/g, '').trim();
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': /^bytes \*\/\d+$/.test(size) ? size : 'bytes */0', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' } });
    }
    if (res.status !== 200 && res.status !== 206) return new NextResponse(res.status === 403 || res.status === 404 ? 'Not found' : `Backend returned ${res.status}`, { status: res.status === 403 ? 404 : res.status });

    const mime = (res.headers.get('Content-Type') || '').replace(/[\r\n]/g, '').trim();
    if (!/^audio\/[a-z0-9.+-]+$/i.test(mime) || !res.body) return new NextResponse('Not found', { status: 404 });
    const out = new Headers();
    out.set('Content-Type', mime);
    out.set('Content-Disposition', 'inline');
    out.set('Accept-Ranges', 'bytes');
    out.set('X-Content-Type-Options', 'nosniff');
    out.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    const length = res.headers.get('Content-Length');
    if (length && /^\d+$/.test(length)) out.set('Content-Length', length);
    const contentRange = (res.headers.get('Content-Range') ?? '').replace(/[\r\n]/g, '').trim();
    if (res.status === 206 && /^bytes \d+-\d+\/\d+$/.test(contentRange)) out.set('Content-Range', contentRange);
    return new NextResponse(res.body, { status: res.status, headers: out });
  } catch (err: unknown) {
    return proxyExceptionResponse(err, 'class voice recording playback');
  }
}
