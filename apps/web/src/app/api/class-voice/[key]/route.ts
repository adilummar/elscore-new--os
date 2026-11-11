import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { proxyExceptionResponse } from '@/lib/api/proxy-error';
import { resolveServerApiUrl } from '@/lib/api/server-api-url';

const KEY = /^[A-Za-z0-9-]{8,64}~\d{4}-\d{2}-\d{2}~\d{1,4}$/;
const LIMIT = 15 * 1024 * 1024 + 64 * 1024;

/**
 * Uploads the tutor's voice recording for one of their classes. The file goes straight on to the API with the signed-in user's own
 * session; the API checks who the tutor is, the real content of the file and its size, and keeps it in private storage.
 */
export async function POST(request: NextRequest, { params }: { params: { key: string } }) {
  const token = cookies().get('accessToken')?.value;
  if (!token) return new NextResponse('Unauthorized', { status: 401 });
  const key = decodeURIComponent(params.key);
  if (!KEY.test(key)) return NextResponse.json({ message: 'That class could not be found.' }, { status: 404 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > LIMIT) return NextResponse.json({ message: 'The recording is larger than 15 MB.' }, { status: 413 });

  try {
    const godViewUserId = cookies().get('godViewUserId')?.value;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (godViewUserId) headers['X-God-View-Target'] = godViewUserId;
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ message: 'Choose a recording first.' }, { status: 400 });
    const out = new FormData();
    out.set('file', file, file.name);
    const res = await fetch(`${resolveServerApiUrl()}/tutor-portal/class-workspace/${encodeURIComponent(key)}/voice`, { method: 'POST', headers, body: out });
    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return proxyExceptionResponse(err, 'class voice recording upload');
  }
}
