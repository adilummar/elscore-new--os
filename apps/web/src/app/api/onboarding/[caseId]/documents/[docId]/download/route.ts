import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { proxyExceptionResponse } from '@/lib/api/proxy-error';
import { resolveServerApiUrl } from '@/lib/api/server-api-url';

export async function GET(
  _request: NextRequest,
  { params }: { params: { caseId: string; docId: string } },
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
    const res = await fetch(
      `${baseUrl}/onboarding/cases/${params.caseId}/documents/${params.docId}/download`,
      {
        method: 'GET',
        headers,
      },
    );

    if (!res.ok) {
      return new NextResponse(`Backend returned ${res.status}`, {
        status: res.status,
      });
    }

    const buffer = await res.arrayBuffer();
    const rawContentType = res.headers.get('Content-Type') || 'application/octet-stream';
    const rawContentDisposition = res.headers.get('Content-Disposition') || 'attachment; filename="document"';

    const contentType = rawContentType.replace(/[\r\n]/g, '').trim() || 'application/octet-stream';
    const contentDisposition = rawContentDisposition.replace(/[\r\n]/g, '').trim() || 'attachment; filename="document"';

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
    return proxyExceptionResponse(err, 'onboarding document download');
  }
}
