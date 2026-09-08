from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request: Request) -> str:
    """Rate-limit key that survives reverse proxies.

    Behind Caddy/Cloudflare every request's socket address is the proxy, so
    keying on remote address alone would throttle ALL users as one client.
    Prefer the first hop of X-Forwarded-For (set by our proxy); fall back to
    the socket address for direct/dev access.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
