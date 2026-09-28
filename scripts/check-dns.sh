#!/usr/bin/env bash
#
# Is the domain wired up yet?
#
# Resolves over DNS-over-HTTPS rather than `dig`, because the answer has to come
# from a public resolver on the internet and not from whatever the laptop's
# network happens to be caching. A record can look perfect in a registrar's panel
# and be invisible to everyone else; this is what tells the difference.
#
#   ./scripts/check-dns.sh                 # easyserveng.com
#   ./scripts/check-dns.sh example.com     # anything else
#
set -uo pipefail

DOMAIN="${1:-easyserveng.com}"
API="${API_HOST:-api.$DOMAIN}"

# What each name should end up pointing at.
WANT_APEX="76.76.21.21"
# The two Cloudflare assigned this zone. Named rather than pattern-matched on
# "cloudflare" so a half-finished nameserver change is caught: three entries with
# one stale Cloudoon server still matches a loose check, and resolvers will keep
# querying the dead one and failing intermittently.
WANT_NS="james.ns.cloudflare.com sue.ns.cloudflare.com"
WANT_WWW="cname.vercel-dns.com"
WANT_API="onrender.com"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
wait_() { printf '  \033[33m…\033[0m %s\n' "$1"; }

# Returns the rdata for a name/type, or the DNS status code prefixed with "!".
resolve() {
  curl -s -m 15 -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$1&type=$2" \
  | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print("!network"); raise SystemExit
a = [x["data"].rstrip(".") for x in d.get("Answer", [])]
print(", ".join(a) if a else "!%s" % d.get("Status"))'
}

explain_status() {
  case "$1" in
    '!2') echo "SERVFAIL — the nameservers are not serving this zone" ;;
    '!3') echo "NXDOMAIN — no such record (check the Name field in the panel)" ;;
    '!0') echo "resolves, but no record of this type" ;;
    '!network') echo "could not reach the resolver" ;;
    *)    echo "$1" ;;
  esac
}

# Is an address inside Cloudflare's own ranges? A proxied record hides its real
# target and answers with one of these instead, so this is how "orange cloud"
# is detected. Fetched rather than hardcoded: guessing at prefixes is what made
# the first version of this call a proxied record healthy.
CF_RANGES=$(curl -s -m 15 https://www.cloudflare.com/ips-v4 2>/dev/null)

is_cloudflare_ip() {
  [ -z "$CF_RANGES" ] && return 1
  CF_RANGES="$CF_RANGES" python3 -c '
import ipaddress, os, sys
try:
    addr = ipaddress.ip_address(sys.argv[1])
except ValueError:
    sys.exit(1)
nets = [ipaddress.ip_network(l) for l in os.environ["CF_RANGES"].split() if l]
sys.exit(0 if any(addr in n for n in nets) else 1)' "$1" 2>/dev/null
}

# Any address in the answer that belongs to Cloudflare means the record is
# proxied, whatever it was configured to point at.
looks_proxied() {
  for token in $(echo "$1" | tr ',' ' '); do
    is_cloudflare_ip "$token" && return 0
  done
  return 1
}

bold "$DOMAIN"
echo

# ── Delegation: who does the registry say is authoritative? ──────────────────
registry_ns=$(curl -s -m 20 "https://rdap.verisign.com/com/v1/domain/$DOMAIN" \
  | python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print(" ".join(n.get("ldhName","").lower() for n in d.get("nameservers",[])))' 2>/dev/null)

bold "Delegation (at the registry)"
expected_ns=$(echo "$WANT_NS" | tr ' ' '\n' | sort | paste -sd' ' -)
actual_ns=$(echo "$registry_ns" | tr ' ' '\n' | grep -v '^$' | sort | paste -sd' ' -)

if [ -z "$registry_ns" ]; then
  wait_ "could not read the registry"
elif [ "$actual_ns" = "$expected_ns" ]; then
  ok "delegated to Cloudflare only: $actual_ns"
elif echo "$registry_ns" | grep -q "cloudflare"; then
  bad "Cloudflare is listed but so is something else: $actual_ns"
  echo "     → remove the leftover entries in Truehost. Resolvers will keep"
  echo "       querying the dead server and fail for some visitors and not others."
else
  wait_ "still $actual_ns"
  echo "     → in Truehost: Domains → My Domains → easyserveng.com → Nameservers"
  echo "       set exactly these two, and clear every other box:"
  for n in $WANT_NS; do echo "         $n"; done
fi
echo

# ── The three records ───────────────────────────────────────────────────────
bold "Records"

apex=$(resolve "$DOMAIN" A)
if looks_proxied "$apex"; then
  bad "$DOMAIN → $apex — PROXIED (orange cloud)"
  echo "     → set the root A record to DNS only."
elif [ "$apex" = "!0" ]; then
  bad "$DOMAIN has no A record — the zone answers but the root is empty"
  echo "     → Cloudflare DNS → Records → Add record:"
  echo "       Type A, Name @, IPv4 $WANT_APEX, Proxy status DNS only"
else
  case "$apex" in
    *"$WANT_APEX"*) ok "$DOMAIN → $apex" ;;
    '!'*)           wait_ "$DOMAIN — $(explain_status "$apex")" ;;
    *)              bad "$DOMAIN → $apex (expected $WANT_APEX)" ;;
  esac
fi

www=$(resolve "www.$DOMAIN" CNAME)
[ "${www:0:1}" = "!" ] && www=$(resolve "www.$DOMAIN" A)
if looks_proxied "$www"; then
  bad "www → $www — PROXIED (orange cloud)"
  echo "     → Cloudflare DNS → Records → www → set Proxy status to DNS only."
  echo "       Proxied, it terminates TLS itself and drops the WebSocket upgrade:"
  echo "       pages load and orders stop reaching the bar screen."
else
  case "$www" in
    *"$WANT_WWW"*|*vercel*) ok "www → $www" ;;
    '!'*)                   wait_ "www — $(explain_status "$www")" ;;
    *)                      bad "www → $www (expected $WANT_WWW)" ;;
  esac
fi

apirec=$(resolve "$API" CNAME)
[ "${apirec:0:1}" = "!" ] && apirec=$(resolve "$API" A)
if looks_proxied "$apirec"; then
  bad "$API → $apirec — PROXIED (orange cloud)"
  echo "     → set this one to DNS only too. The API is what carries the"
  echo "       WebSocket, so proxying it is the more damaging of the two."
else
  case "$apirec" in
    *"$WANT_API"*) ok "$API → $apirec" ;;
    '!'*)          wait_ "$API — $(explain_status "$apirec")" ;;
    *)             bad "$API → $apirec (expected something on $WANT_API)" ;;
  esac
fi
echo

# ── Does anything actually answer? ──────────────────────────────────────────
bold "Live checks"
health=$(curl -s -m 25 "https://$API/health" 2>/dev/null)
if echo "$health" | grep -q '"status"'; then
  ok "https://$API/health → $health"
else
  wait_ "https://$API/health not answering yet"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' -m 25 "https://$DOMAIN" 2>/dev/null)
case "$code" in
  200|30[0-8]) ok "https://$DOMAIN → HTTP $code" ;;
  000)         wait_ "https://$DOMAIN — no TLS/connection yet" ;;
  *)           bad "https://$DOMAIN → HTTP $code" ;;
esac
echo

# A record served while the zone is broken is the trap worth naming: it looks
# saved in the panel and is invisible to the internet.
if [ "${apex:0:1}" = "!" ] && echo "$registry_ns" | grep -q cloudflare; then
  echo "Nameservers are Cloudflare's but the apex does not resolve — the records"
  echo "may not have been added in Cloudflare yet, or the Name field is wrong."
fi
