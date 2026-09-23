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
    return NextResponse.redirect(new URL('/login', request.url), 303);
  }

  // If we have no access token but have a refresh token, we should refresh it
  if (!accessToken && refreshToken) {
    try {
      let apiUrl = process.env.API_URL;
      
      if (!apiUrl) {
        if (process.env.NODE_ENV === 'development') {
          apiUrl = 'http://localhost:3001/api/v1';
        } else {
          console.error('[CONFIG ERROR] API_URL is missing in production/staging environment.');
          // Fail clearly by throwing or deleting cookies and returning to login
          const response = NextResponse.redirect(new URL('/login', request.url), 303);
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
        const secureCookies = process.env.COOKIE_SECURE !== 'false';
        
        // Seamlessly continue the request with new cookies
        const requestHeaders = new Headers(request.headers);
        
        // Reconstruct the Cookie header with the new tokens
        const currentCookies = request.cookies.getAll()
          .filter(c => c.name !== 'accessToken' && c.name !== 'refreshToken')
          .map(c => `${c.name}=${c.value}`);
          
        currentCookies.push(`accessToken=${data.accessToken}`);
        if (data.refreshToken) {
          currentCookies.push(`refreshToken=${data.refreshToken}`);
        }
        
        requestHeaders.set('Cookie', currentCookies.join('; '));

        const response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        
        response.cookies.set('accessToken', data.accessToken, {
          httpOnly: true,
          secure: secureCookies,
          sameSite: 'lax',
          path: '/',
          maxAge: 15 * 60,
        });
        
        if (data.refreshToken) {
          response.cookies.set('refreshToken', data.refreshToken, {
            httpOnly: true,
            secure: secureCookies,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60,
          });
        }
        
        return response;
      } else {
        // Failed to refresh, redirect to login
        const response = NextResponse.redirect(new URL('/login', request.url), 303);
        response.cookies.delete('accessToken');
        response.cookies.delete('refreshToken');
        return response;
      }
    } catch (error) {
      // Failed to refresh, redirect to login
      const response = NextResponse.redirect(new URL('/login', request.url), 303);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }
  }

  // If authenticated and trying to access login page
  if (accessToken && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url), 303);
  }

  // Root redirect
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url), 303);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};