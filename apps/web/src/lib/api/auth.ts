'use server';
import { fetchApi } from './client';
import { cookies } from 'next/headers';

export async function login(credentials: { email: string; password: string }): Promise<{ mustChangePassword?: boolean; error?: string }> {
  const apiBase = process.env.API_URL || 'http://localhost:3001/api/v1';
  console.log('Attempting login to API:', `${apiBase}/auth/login`);
  
  let res;
  try {
    res = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch (fetchErr: any) {
    console.error('Fetch to NestJS completely failed:', fetchErr);
    return { error: 'Could not connect to server. Please try again.' };
  }

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error('API returned non-ok status:', res.status, errJson);
    const errData = errJson.message || errJson.data?.message || 'Invalid credentials. Please try again.';
    return { error: errData };
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return { error: 'Unexpected server response. Please try again.' };
  }

  // NestJS TransformInterceptor wraps all responses: { data: {...}, timestamp: "..." }
  const data = json.data ?? json;

  const cookieStore = cookies();
  // COOKIE_SECURE=false disables the Secure flag for HTTP staging environments.
  // In production (HTTPS), COOKIE_SECURE should be 'true' or unset (defaults secure).
  const secureCookies = process.env.COOKIE_SECURE !== 'false';

  cookieStore.set('accessToken', data.accessToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 mins
  });

  cookieStore.set('refreshToken', data.refreshToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  // Return data so client can decide where to navigate
  return {
    mustChangePassword: data.mustChangePassword ?? false,
  };
}

export async function logout() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('refreshToken')?.value;

  if (refreshToken) {
    try {
      await fetchApi('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch (e) {
      // Ignore logout errors
    }
  }

  cookieStore.delete('accessToken');
  cookieStore.delete('refreshToken');
}

export async function getSession() {
  try {
    return await fetchApi<any>('/auth/me');
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return null;
    }
    return null;
  }
}
