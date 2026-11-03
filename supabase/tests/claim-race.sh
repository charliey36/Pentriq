#!/usr/bin/env bash
# Concurrency check for the cron senders' claim (src/lib/send-claim.ts, claimDue): separate connections race to
# claim the same due messages with the same conditional UPDATE the code sends through PostgREST. Every row must
# end up claimed by exactly one of them, or two runs of /api/send-messages would email the same customer.
#
# Run by scripts/verify-db.sh after the migrations; it commits fixture rows, so only point it at that script's
# throwaway database.
set -euo pipefail

DB="$1"
PSQL=(psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB")
BIZ='dddddddd-0000-0000-0000-000000000001'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

"${PSQL[@]}" <<SQL
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'race@test.invalid') on conflict do nothing;
insert into public.businesses (id, owner_id, name) values ('$BIZ', '00000000-0000-0000-0000-0000000000d1', 'Race') on conflict do nothing;
insert into public.customers (id, business_id, name, email)
  values ('dddddddd-0000-0000-0000-0000000000c1', '$BIZ', 'Racer', 'racer@test.invalid') on conflict do nothing;
delete from public.messages where business_id = '$BIZ';
insert into public.messages (business_id, customer_id, purpose, send_at)
  select '$BIZ', 'dddddddd-0000-0000-0000-0000000000c1', 'review_request', now() - interval '1 hour' from generate_series(1, 50);
SQL

# What every run reads first: the due rows, oldest first (the code's select).
ids=$("${PSQL[@]}" -c "select string_agg(quote_literal(id::text), ',' order by send_at) from public.messages where business_id = '$BIZ' and status = 'pending'")
# The claim, as PostgREST sends it: update ... where id in (read ids) and still pending and still due, returning id.
claim="update public.messages set next_attempt_at = now() + interval '15 minutes'
  where id in ($ids) and status = 'pending' and send_at <= now() and (next_attempt_at is null or next_attempt_at <= now())
  returning id"
uuids() { grep -E '^[0-9a-f]{8}-[0-9a-f]{4}-' "$1" || true; }
fail() { echo "FAILED: $1" >&2; exit 1; }

# 1. Overlap: run A holds its claim open while run B arrives with the same rows. B must wait, then get nothing.
"${PSQL[@]}" -c "begin; $claim; select pg_sleep(1.5); commit;" > "$WORK/a" &
sleep 0.5
"${PSQL[@]}" -c "$claim" > "$WORK/b"
wait
[[ $(uuids "$WORK/a" | wc -l) -eq 50 ]] || fail "run A should have claimed all 50 rows, got $(uuids "$WORK/a" | wc -l)"
[[ $(uuids "$WORK/b" | wc -l) -eq 0 ]] || fail "run B claimed $(uuids "$WORK/b" | wc -l) rows run A already held"
echo "    ok  overlapping runs: the second claim waits, then claims none of the first run's rows"

# 2. Stampede: eight runs claim the same 50 rows at once. Each row exactly once, none left out.
"${PSQL[@]}" -c "update public.messages set next_attempt_at = null where business_id = '$BIZ'"
for n in 1 2 3 4 5 6 7 8; do "${PSQL[@]}" -c "$claim" > "$WORK/run$n" & done
wait
cat "$WORK"/run* | grep -E '^[0-9a-f]{8}-' > "$WORK/all" || true
total=$(wc -l < "$WORK/all")
unique=$(sort -u "$WORK/all" | wc -l)
[[ $total -eq 50 && $unique -eq 50 ]] || fail "8 concurrent claims returned $total rows ($unique distinct); expected each of 50 exactly once"
echo "    ok  8 simultaneous runs: each of 50 rows claimed exactly once"

# 3. A claimed row is not due for anyone else until the lease ends; a released row is due again at once.
[[ $("${PSQL[@]}" -c "$claim" | grep -cE '^[0-9a-f]{8}-' || true) -eq 0 ]] || fail "claimed rows were claimable again"
"${PSQL[@]}" -c "update public.messages set next_attempt_at = now() - interval '1 second' where business_id = '$BIZ'"
[[ $("${PSQL[@]}" -c "$claim" | grep -cE '^[0-9a-f]{8}-' || true) -eq 50 ]] || fail "released rows were not claimable"
echo "    ok  leases hold rows until released"

"${PSQL[@]}" -c "delete from public.businesses where id = '$BIZ'; delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';"
