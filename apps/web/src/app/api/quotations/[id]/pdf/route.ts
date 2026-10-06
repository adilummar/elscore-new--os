import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BASE_URL = process.env.API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001/api/v1' : '');

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

    const res = await fetch(`${BASE_URL}/quotations/${params.id}/pdf`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      return new NextResponse(`Backend returned ${res.status}`, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    const contentDisposition = res.headers.get('Content-Disposition') || 'attachment; filename="Quotation.pdf"';

    const nextHeaders = new Headers();
    nextHeaders.set('Content-Type', 'application/pdf');
    nextHeaders.set('Content-Disposition', contentDisposition);

    return new NextResponse(buffer, {
      status: 200,
      headers: nextHeaders,
    });
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 });
  }
}
