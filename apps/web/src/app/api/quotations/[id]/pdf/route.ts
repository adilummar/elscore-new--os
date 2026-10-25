import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { proxyExceptionResponse } from '@/lib/api/proxy-error';
import { resolveServerApiUrl } from '@/lib/api/server-api-url';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const token = cookieStore.get('accessToken')?.value;
  const godViewUserId = cookieStore.get('godViewUserId')?.value;

  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (godViewUserId) {
      headers['X-God-View-Target'] = godViewUserId;
    }

    const baseUrl = resolveServerApiUrl();
    const res = await fetch(`${baseUrl}/quotations/${params.id}/pdf`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      return new NextResponse(`Backend returned ${res.status}`, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    const contentDisposition = (res.headers.get('Content-Disposition') || 'attachment; filename="Quotation.pdf"')
      .replace(/[\r\n]/g, '')
      .trim() || 'attachment; filename="Quotation.pdf"';

    const rawContentType = res.headers.get('Content-Type') || 'application/pdf';
    const contentType = rawContentType.replace(/[\r\n]/g, '').trim() || 'application/pdf';

    const nextHeaders = new Headers();
    nextHeaders.set('Content-Type', contentType);
    nextHeaders.set('Content-Disposition', contentDisposition);
    nextHeaders.set('X-Content-Type-Options', 'nosniff');
    nextHeaders.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return new NextResponse(buffer, {
      status: 200,
      headers: nextHeaders,
    });
  } catch (err: unknown) {
    return proxyExceptionResponse(err, 'quotation PDF download');
  }
}
