/** Where the web app (sign-in and the other roles) lives. Always ends with a slash. */
export const WEB_URL: string = import.meta.env.VITE_WEB_URL ?? "/";
export const WEB_SIGN_IN_URL = `${WEB_URL}sign-in`;
