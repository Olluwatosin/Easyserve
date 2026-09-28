/**
 * Turning a failed sign-in into a sentence that tells somebody what to do.
 *
 * The login screen used to fall back to "Login failed" whenever the error
 * carried no `detail` — which is precisely the case where the request never
 * reached the API at all. So the one message that meant "this is a network
 * problem, not your password" was the one that looked most like a rejected
 * password, and a staff member would stand there retyping perfectly good
 * credentials against a server they could not reach.
 *
 * Each branch below is a different thing to do about it, which is the only
 * reason to tell them apart.
 */

interface AxiosLikeError {
  response?: { status?: number; data?: { detail?: unknown } };
  code?: string;
  message?: string;
}

export function signInError(err: unknown): string {
  const e = (err ?? {}) as AxiosLikeError;

  // No response object means the request never completed: DNS, TLS, CORS, a
  // dropped connection, or a timeout. None of those are the password.
  if (!e.response) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "You are offline — reconnect and try again";
    }
    if (e.code === "ECONNABORTED" || /timeout/i.test(e.message ?? "")) {
      return "The server took too long to answer — try again";
    }
    return "Could not reach the server — check your connection and try again";
  }

  const status = e.response.status ?? 0;

  // The rate limiter, which otherwise reads as a wrong password and invites
  // exactly the retrying that triggered it.
  if (status === 429) {
    return "Too many attempts — wait a minute, then try again";
  }

  if (status >= 500) {
    return "Something went wrong on our side — try again in a moment";
  }

  // The API's own wording, which knows whether it was the address, the password
  // or a switched-off account. Guarded because `detail` is not always a string:
  // a validation error arrives as an array and would render as "[object Object]".
  const detail = e.response.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (status === 401 || status === 403) {
    return "That email and password did not work";
  }

  return "Could not sign you in — please try again";
}
