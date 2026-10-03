export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // COOKIE_SECURE=false is the explicit HTTP-staging override.
    // Production should set true or leave this unset so cookies stay Secure.
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
