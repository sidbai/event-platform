---
name: import-schedules
description: Bring an outside tournament's or league's schedule, results or standings into King Juan Soccer. Use when asked to import, sync, connect, re-sync, paste or scrape an event from Athletes2Events, EventConnect, AthleteOne, Modular11, Sports Affinity, GotSport or any platform we do not run — and before writing a new parser branch, connecting a league, or working out why an import landed wrong.
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
a row when a platform is new. The six there today:

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
- `modular11` — no robots.txt at all (404), no bot protection, no origin
  check. **Polled.** Recorded as `silent` rather than `allows`, and the
  difference is the point: a site that publishes nothing has not permitted
  anything, it has said nothing.
- `sportsaffinity` — also silent, also polled. It sits behind Imperva, which
  serves some clients a challenge instead of a page; ours is answered in full,
  which is a thing to keep checking rather than to assume.
- `gotsport` — `Disallow: /` for every agent, and separately a 302 to
  `/verify_captchas/new` on any unauthenticated event page, whatever user
  agent it carries. Either one settles it on its own; both are recorded so
  that a reader who only knew about the captcha does not go looking for a way
  round it. **Nobody here solves captchas**, and that is not a compliance
  position — it holds even where the terms would allow it.

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

## The ids a connector needs, and where next season's are

Every connector here is pointed at a season by ids that are somebody else's
and change when the season does. The failure is loud rather than quiet —
a stale id returns an empty list, not a short one — but it still has to be
findable in a year.

**ECNL (AthleteOne, bookmarklet).** `ecnl-leagues.ts` holds six leagues with
three ids each: `org`, `season`, `event`. Read them off a league's schedule
page in DevTools — the Network tab shows
`get-division-list-by-event-id/{org}/{event}/0/0` and then
`get-conference-schedules/{org}/{season}/{event}/{division}/0`. Six leagues,
one Northwest conference each.

**EA (Modular11, connector).** Three numbers in an event id, `27-47-216`:
tournament, bracket, conference. Only the bracket is in the page's address
(`/league-schedule/elite-academy-league/47`); the other two are in the
requests its scripts make. `groups=` is plural — `group=` is accepted,
ignored, and returns the whole country.

**RCL (Sports Affinity, connector).** One id: the tournament guid, out of any
of their public pages. Their own links spell the parameter two ways, so the
reader looks it up case-insensitively and strips braces. Flights are not
listed anywhere — they are discovered from the accepted-teams pages, one per
gender, which is also the only place a flight's age code is written down.

**WPL (GotSport).** Not connected. An unauthenticated request 302s to
`/verify_captchas/new`. Nobody here solves captchas, so this is browser-only
until the organizer says otherwise.

## Reading a page a browser was going to render

Two things learned doing this three times in a week, both of which cost an
afternoon:

**Read the markup, not what a browser would have shown.** Modular11's rows
are a responsive grid carrying every value twice, and the copy a browser
hides is the complete one — the visible column truncates the venue with an
ellipsis. A test written against the visible column passes and imports
`Lincoln Field -…`.

**A fixture's date may not be in its row.** Sports Affinity puts it in a
heading above a run of rows, the way a printed fixture list is laid out. The
reader splits the page on those headings and gives each segment the date that
opened it; a row with no heading above it yields nothing, because a guessed
date is worse than none.

And a placeholder is not data. `--`, `Virtual TBD`, `TBD` — most of a season
looks like that before the fields are booked, and carrying them through puts
them on a parent's screen as a real time at a real ground.

## A platform must be registered in three places

`PROVIDERS` in `sync/run.ts`, `PROVIDER_POLICIES` and `HOSTS` in
`sync/policy.ts`. Miss `HOSTS` and everything looks fine until a connect
silently saves a link instead of syncing — `platformOf` returns null, so the
admin screen cannot even say why. This has happened. `policy.test.ts` now
checks all three agree; verify a change to it by deleting a line and watching
it go red.

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

## The order that works

Learned by doing it the other way round. Elite Academy cost a reset, a
re-sync and most of an evening, and every question that would have prevented
it could have been asked before a single row was written.

**A synced team's name is written only when its row is created.** Re-syncing
matches on the platform's own ids and updates what it finds — which is right,
and is why a name that landed wrong stays wrong. There is no fixing it in
place; there is only writing the rows again.

1. **Ask first.** `pnpm db:sync:preflight --url=<a page on the platform>`
   fetches the league and reports what would land wrong: clubs the directory
   does not have, names two teams would share, names that would not survive
   being read back. Reads only, writes nothing.
2. **Fix what it names.** Usually an alias rather than a new club —
   `3RSC` is Three Rivers Soccer Club and shares no words with it, so the
   matcher cannot reach it. `pnpm db:clubs:alias --club=<slug> --alias='3RSC'`.
   A club that genuinely is missing goes in at `/clubs/new` — and check
   whether it is missing or merely unreachable before adding a second row for
   a club that is already there.
3. **Connect it**, at `/admin/sync`.
4. **Check what landed.** `pnpm db:sync:verify --event=<slug>`.

To write a league again, `pnpm db:sync:reset --event=<slug> --apply` and then
re-connect. It deletes the fixtures, the entries and the teams this event is
the whole of — never a team that plays elsewhere, is claimed, or has a roster
— **and the content digest**, which is the part that is easy to forget: a
sync whose fetch hashes to the same value returns "unchanged" and writes
nothing, so a reset that leaves the digest behind reads as a success and
leaves the league empty.

## Checking an import afterwards

`pnpm db:sync:verify --event=<slug>` asks the database rather than
downloading it: a count and five examples per check. The version of this that
pulled the whole teams table and compared it in memory exhausted the
database's transfer allowance and took the site down for an hour — so if a
question needs a new check, add it there as SQL rather than writing another
script that fetches everything.

`!!` is a fault. `??` is worth reading and often fine — a club playing a
younger side up an age group is what tournaments are for, and a team renamed
after its address was made keeps the old address.

When something else needs counting, these two still earn their place:

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
pnpm db:clubs:alias          # a club is also called this; dry run without --apply
pnpm db:teams:rename         # --event=<slug> keeps the dry run readable
pnpm db:sync:reset           # throw a league away so it can be written again
pnpm db:check                # read-only, verifies a migration landed
pnpm db:migrate              # from the PR branch — the file is not on main yet
```

"Migration done" is not proof. Run `db:check` and read the ✓.

Reads are not refused, but they are not free either. A full-table read
against production, repeated through an evening of checking, is what
exhausted the transfer allowance. Ask in SQL, take the columns needed, and do
not fetch the same table twice in one sitting.

## What cost an evening, and what it looked like

None of these announced itself. Each was found by reading data, and each is
now a check in `db:sync:verify` so the next one is found by running it.

**A fact the platform states in a column of its own.** Modular11 writes the
gender there and nowhere else — not in a team's name, not in a division
label. Without it the canonical name has nothing to build and falls back to
the published one, so seven ages of Harbor SC arrived as seven teams all
called "Harbor SC", with addresses to match: `/teams/harbor-sc-7`. Look for
what a platform knows that its names do not say.

**Adjacent age groups overlap by a year.** U13 is 2013 and 2014, U14 is 2012
and 2013. Binding asked whether two rows shared a year, which is true of
every pair of adjacent age groups a club fields — so a club's U13 side bound
to its U14 side, the second entry was dropped by `UNIQUE (event_id,
team_id)`, and 344 of 928 fixtures ended up filed under an age group whose
teams were in another one. The rule is `sameCohort` in `teams/age.ts`: the
same set, or one inside the other.

**The canonical name has to read back as itself.** A colour counts as a tier
only behind an age group — and the canonical form is what puts one there. So
the first pass wrote `WW Surf B07/08 Surf Academy Blue` and the second read
its own output and moved the colour. A rewrite that keeps rewriting cannot be
checked, and the dry run is the only check there is.

**A club's own word is not a translation of it.** Atletico names its sides
Azul, Rojo and Oro; "Oro" was read as the tier Gold, so one side of four had
the club's word replaced. If a rule maps a word to a canonical spelling, ask
whether some club means it as a name.

**A bracket slot is not a team.** Sports Affinity publishes `A11 vs A7` in
the group column and `A11` in the team column until a club is assigned. Read
literally that is a team in the directory, bound to the `A11` of every other
flight.

**A missing club is often a missing alias.** Nine ALBION teams went under
ALBION SC Portland because it was the only ALBION the directory had; two real
clubs were missing. Seven 3RSC teams had no club because the alias was
missing. The preflight reports both the same way — check which it is.
