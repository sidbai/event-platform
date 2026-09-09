---
name: import-schedules
description: Bring an outside tournament's schedule, results or standings into King Juan Soccer. Use when asked to import, sync, paste or scrape an event from Athletes2Events, EventConnect, AthleteOne or any platform we do not run — and before writing a new parser branch for one.
---

# Importing somebody else's schedule

Most events here are run by other people on platforms we do not control. This
is what was learned bringing them in, so the next one costs an hour rather
than a day.

## Decide the route before writing anything

Read `robots.txt` **first**, and the terms if they are published. Record the
address of whatever was actually read in `termsUrl` — a policy test refuses an
entry without one, because "we checked" that nobody can re-check is not a
record. Where a platform publishes no reachable terms (AthleteOne), that
address is its robots.txt.

The binding document decides the route; being technically able to fetch a page
decides nothing. A connector was once shipped against a platform whose terms said one
thing and whose robots.txt said another.

| what the source allows | route |
|---|---|
| robots.txt permits crawling | **connector** — `src/features/sync/run.ts`, polled by the cron, cadence from `cadence.ts` |
| robots.txt refuses, but a person can open the page | **bookmarklet** — `copier.ts`; it reads what their own browsing put on screen and makes no request of its own |
| refuses, and the data is not worth the clicks | **link only** — the event page's "Schedule & standings" button |

The line is **who initiates each page load**, not what renders it. A headless
browser walking a site is a crawler; a person clicking through it is a
visitor. Packaging the automation differently — a script, a skill, a model —
does not move that line. Permission does: if the organizer says yes, the
automated path becomes available and this table changes for them.

**`PROVIDER_POLICIES` in `sync/policy.ts` is the record**, not this file: it
holds each platform's robots posture, its terms URL, the date it was last
reviewed, and the reasoning. Read it rather than trusting a summary, and add
a row when a platform is new. The three there today:

- `athletes2events` — robots.txt allows (it disallows four admin paths and
  permits the rest, which is what Google indexes these schedules under). Its
  terms separately ask for permission to scrape and none has been requested;
  the owner's decision is that the machine-readable signal is the one we
  follow, and that if A2E ever asks us to stop this becomes "refused" and the
  connector stops with it. **Polled.**
- `eventconnect` — `Disallow: /`. Not polled.
- `athleteone` — `Disallow: /` for everything but the auth pages, plus the AI
  crawlers named individually. No export of any kind on their event pages, and
  the divisions are click handlers rather than links. Not polled; the
  bookmarklet is the route.

`SYNC_OVERRIDE_PLATFORMS` exists to poll a refused platform deliberately, and
the admin screen shows in amber when it is doing so. It is not a way around a
decision; it is a way to make one visible.

## Where each platform hides the things that matter

Every platform publishes the same facts in a different place. These are the
ones that have already cost time:

**The final.** Three shapes, all read by `teams/honours.ts`:
- events we run: `stage = 'ko'`, `round = 'final'`
- Athletes2Events: `group_label = 'Final'`, in the same field as `Semi-Finals A`
  — so match it anchored, never as a substring
- EventConnect: a **division of its own**, `Boys U12 Championships`, sitting
  beside the group divisions. Every game in it is one flight's final, and the
  guard is that the team played exactly one decided game there

**The fixture row.** AthleteOne stacks a game into three cells — when, who and
where, how it finished — rather than laying it out in columns. Read generically
both teams land in one field and the date and score are lost. `copier.ts`
recognises it by the header (`Game Info` / `Teams & Venues`), never by URL.

**Pagination.** AthleteOne's tables show ten rows and print
`Lines per page 1-10 of 34`. A paste holding ten of thirty-four looks
complete, which makes it the worst failure available. The bookmarklet counts
the shortfall and says so; do not click their pager for them, because that
makes requests the tool must not make.

**Navigation.** AthleteOne's divisions are not links, they are click handlers,
so there is no list of addresses to give anybody. Routing is client-side,
which is why the bookmarklet's basket survives it.

## Before the data lands

- **Dates are checked.** `sync/date-guard.ts` refuses a paste whose dates fall
  entirely outside the event's own, with an override. This exists because 421
  Labor Day fixtures were once written into a June tournament and sat under
  both events until a parent noticed the same game twice.
- **Teams bind on facts, not names.** `teams/binding.ts`: the name must match
  exactly, nothing may contradict, and something must positively agree. Two
  clubs in one region both field a "Warriors".
- **Deduplicate before anybody claims a team.** `mergeTeams` refuses to absorb
  a team somebody holds, so a claim freezes that row against the cleanup.
- **The organizer's standings beat ours.** We can compute a table from results,
  and for an event we run that is right; for somebody else's, a different
  tiebreaker produces a different table from the same games.

## Checking an import afterwards

Count what landed, and compare it against what the source said. The queries
that actually answer this:

```sql
-- what came in, by day
select to_char(m.kickoff_at at time zone 'America/Los_Angeles','YYYY-MM-DD') as day,
       count(*) as games, count(*) filter (where m.home_score is null) as unscored
from matches m join events e on e.id = m.event_id
where e.slug = 'SLUG' group by 1 order by 1;

-- the failure worth ruling out: one fixture under two events
select e1.slug, e2.slug, count(*) from matches m1
join matches m2 on m1.home_team_id = m2.home_team_id
 and m1.away_team_id = m2.away_team_id and m1.kickoff_at = m2.kickoff_at
 and m1.event_id <> m2.event_id
join events e1 on e1.id = m1.event_id join events e2 on e2.id = m2.event_id
group by 1,2;
```

`matches` has **no** `created_at` or `updated_at`. A query against them errors
rather than returning nothing, and reading that error as "no rows, so nothing
was written" is how the wrong-event paste was declared harmless the first time.

## Things that are the owner's to run

Production writes are refused here. Hand over the command with the
`DATABASE_URL=` prefix and wait for the output:

```
pnpm db:merge:teams          # duplicates, dry run; --apply to write
pnpm db:check                # read-only, verifies a migration landed
pnpm db:migrate              # from the PR branch — the file is not on main yet
```

"Migration done" is not proof. Run `db:check` and read the ✓.
