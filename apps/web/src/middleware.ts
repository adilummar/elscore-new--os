import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/setup-password');
  
  // Public assets
  if (request.nextUrl.pathname.startsWith('/_next') || request.nextUrl.pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }

  // If no tokens at all and trying to access protected route
  if (!accessToken && !refreshToken && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If we have no access token but have a refresh token, we should refresh it
  if (!accessToken && refreshToken) {
    try {
      let apiUrl = process.env.API_URL;
      
      if (!apiUrl) {
        if (process.env.NODE_ENV === 'development') {
          apiUrl = 'http://127.0.0.1:3001/api/v1';
        } else {
          console.error('[CONFIG ERROR] API_URL is missing in production/staging environment.');
          // Fail clearly by throwing or deleting cookies and returning to login
          const response = NextResponse.redirect(new URL('/login', request.url));
          response.cookies.delete('accessToken');
          response.cookies.delete('refreshToken');
          return response;
        }
      }

      const res = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (res.ok) {
        const data = await res.json();
        const response = NextResponse.redirect(request.url); // Redirect to same URL to reload with new cookies
        
        response.cookies.set('accessToken', data.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 15 * 60,
        });
        
        if (data.refreshToken) {
          response.cookies.set('refreshToken', data.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60,
          });
        }
        
        return response;
      } else {
        // Failed to refresh, redirect to login
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('accessToken');
        response.cookies.delete('refreshToken');
        return response;
      }
    } catch (error) {
      // Failed to refresh, redirect to login
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }
  }

  // If authenticated and trying to access login page
  if (accessToken && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Root redirect
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};