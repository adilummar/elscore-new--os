'use server';
import { fetchApi } from './client';
import { cookies } from 'next/headers';

export async function login(credentials: { email: string; password: string }) {
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
    throw new Error('Could not connect to API server: ' + fetchErr.message);
  }

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error('API returned non-ok status:', res.status, errJson);
    const errData = errJson.message || errJson.data?.message || 'Login failed';
    throw new Error(errData);
  }

  const json = await res.json();
  // NestJS TransformInterceptor wraps all responses: { data: {...}, timestamp: "..." }
  const data = json.data ?? json;

  const cookieStore = cookies();
  cookieStore.set('accessToken', data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 mins
  });

  cookieStore.set('refreshToken', data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  // Return data so client can decide where to navigate
  return {
    requiresPasswordChange: data.requiresPasswordChange ?? false,
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
