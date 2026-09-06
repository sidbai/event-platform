#!/usr/bin/env bash
#
# Ask the running app for its most important pages and insist on a 200.
#
# The cheapest test there is, and it would have caught the one bug that got
# furthest this session: a query that built, typechecked, linted and passed
# every unit test, then threw against a real driver and took the home feed
# down. Nothing that renders a page can hide that.
#
# Deliberately dumb. It asserts status codes, not content — content is what the
# unit and database suites are for, and a smoke test that reads markup becomes
# a smoke test that breaks on every copy change.
#
#   scripts/smoke.sh http://127.0.0.1:3000 [extra /paths...]
set -uo pipefail

BASE="${1:?usage: smoke.sh BASE_URL [path...]}"
shift || true

# The event slug is passed in because it is seeded, not fixed. Everything else
# is a route that must exist for the site to be worth deploying.
PATHS=("/" "/events" "/news" "/community" "/clubs" "/teams" "$@")

# Readiness means "answering HTTP", not "answering well". Waiting for a 200
# here would report a broken home page as a server that never started, which
# is the wrong thing to go looking for.
echo "waiting for $BASE"
for i in $(seq 1 60); do
  # The || goes on the assignment, not inside the substitution: curl prints
  # "000" itself when it cannot connect, so `$(curl ... || echo 000)` yields
  # "000000" — which is not "000", so the wait ended immediately and every
  # route was checked before the server had opened its socket.
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE/" 2>/dev/null) || code=000
  if [ "$code" != "000" ]; then
    echo "answering after ${i}s (/ gave $code)"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "no HTTP response after 60s — the server never started"
    exit 1
  fi
  sleep 1
done

fails=0
BODIES=$(mktemp -d)

for p in "${PATHS[@]}"; do
  # One file per path, so a failure is still inspectable after the run rather
  # than overwritten by the next request.
  body="$BODIES/$(echo "$p" | tr '/' '_').html"
  code=$(curl -s -o "$body" -w "%{http_code}" --max-time 20 "$BASE$p")
  if [ "$code" = "200" ]; then
    printf '  %-44s %s\n' "$p" "$code"
  else
    printf '  %-44s %s  <-- FAILED\n' "$p" "$code"
    # A Next error page is one enormous line of RSC payload, so dumping the
    # body is worse than useless. The message is in there as a JSON field.
    # The payload is JSON inside a script tag, so its quotes arrive escaped:
    # message\":\"... rather than "message":"...".
    grep -o 'message[^,]\{0,200\}' "$body" | head -2 | sed 's/\\\\*"/"/g; s/^/      /'
    echo "      (full response in $body)"
    fails=$((fails + 1))
  fi
done

if [ "$fails" -gt 0 ]; then
  echo "$fails route(s) did not return 200"
  exit 1
fi
echo "all ${#PATHS[@]} routes returned 200"
