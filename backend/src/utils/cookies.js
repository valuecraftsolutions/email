const baseOptions = (session) => ({
  httpOnly: true,
  secure: session.cookieSecure,
  sameSite: session.cookieSameSite,
  path: '/',
});

export function setSessionCookie(res, config, token, expiresAt) {
  res.cookie(config.session.cookieName, token, {
    ...baseOptions(config.session),
    expires: expiresAt,
  });
}

export function clearSessionCookie(res, config) {
  res.clearCookie(config.session.cookieName, baseOptions(config.session));
}

export const readSessionCookie = (req, config) =>
  req.cookies?.[config.session.cookieName];
