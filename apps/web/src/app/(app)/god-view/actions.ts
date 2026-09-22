'use server';
import { cookies } from 'next/headers';
import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

/** Enter God View as a target user. Sets godViewUserId cookie. */
export async function enterGodViewAction(targetUserId: string): Promise<{ error?: string }> {
  try {
    // Validate the target user and log audit via backend
    await fetchApi(`/auth/god-view/${targetUserId}`);

    const cookieStore = cookies();
    const secureCookies = process.env.COOKIE_SECURE !== 'false';
    cookieStore.set('godViewUserId', targetUserId, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: 4 * 60 * 60, // 4 hours max god view session
    });
    revalidatePath('/', 'layout');
    return {};
  } catch (e: any) {
    return { error: e?.message || 'Failed to enter God View' };
  }
}

/** Exit God View. Clears godViewUserId cookie. */
export async function exitGodViewAction(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete('godViewUserId');
  revalidatePath('/', 'layout');
}

/** Fetch the god view target user's profile from the API. */
export async function getGodViewProfile(targetUserId: string) {
  try {
    return await fetchApi<any>(`/auth/god-view/${targetUserId}`);
  } catch {
    return null;
  }
}
