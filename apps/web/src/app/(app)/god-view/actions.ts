'use server';
import { cookies } from 'next/headers';
import { authCookieOptions } from '@/lib/auth/auth-cookie-options';
import { fetchApi } from '@/lib/api/client';
import { revalidatePath } from 'next/cache';

/** Enter God View as a target user. Sets godViewUserId cookie. */
export async function enterGodViewAction(targetUserId: string): Promise<{ error?: string }> {
  try {
    // Validate the target user and log audit via backend
    await fetchApi(`/auth/god-view/${targetUserId}`);

    const cookieStore = cookies();
    cookieStore.set('godViewUserId', targetUserId, authCookieOptions(4 * 60 * 60));
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
