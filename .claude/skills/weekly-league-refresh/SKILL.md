# Refreshing a league's results each week

The ECNL leagues, the WPL and the Girls Academy publish a whole season at
once and fill in the scores as they are played. So this is not an import that
happens once — it is a thing to do every week, and the cost of doing it badly
is that it stops happening.

Collecting the fixtures needs a person. Everything after that does not. And
it is **one habit for all nine leagues** — the owner's rule when GotSport was
added: one bookmark, one click, one file, one command. Not a second flow.

## Why a person is still in the loop

`api.athleteone.com` answers a plain request **403 — "you do not have
permission to perform this operation"**. The endpoints are open to the widget
embedded on theecnl.com and to nobody else, so reading them from a server
would mean forging an `Origin` header to claim we are that site. That is
circumventing an access control rather than ignoring a preference, and it is
not something to do for a schedule.

What is fine, and is what this does: a person opens the page they were going
to look at anyway, and a few lines in their own console collect what their own
browser fetched. Nothing here ever speaks to the platform.

`SYNC_OVERRIDE_PLATFORMS` does not help. It governs whether *we* hold back,
not whether *they* answer.

GotSport (WPL, GA) is the same line drawn harder: `robots.txt` is a bare
`Disallow: /`, and a request without their cookie is sent to a captcha. The
person has passed that captcha in their own browser; the bookmark, clicked on
a `system.gotsport.com` page, reads the pages that browser is shown. Nothing
here ever speaks to them.

## The ids, so the snippet needs no clicking

All six are the Northwest conference of the 2026-27 season. The API takes ids
and does not care which page asks, so **one page can fetch all six**.

| League | org | season | event |
|---|---|---|---|
| ECNL Boys | 12 | 81 | 4284 |
| ECNL Girls | 9 | 80 | 4268 |
| ECNL RL Boys | 16 | 83 | 4353 |
| ECNL RL Girls | 13 | 82 | 4311 |
| Pre-ECNL Boys | 22 | 87 | 4385 |
| Pre-ECNL Girls | 21 | 86 | 4384 |

**GotSport, one id each** — the number in
`system.gotsport.com/org_event/events/<id>`, read off the league's own site
(wpl-soccer.com and girlsacademyleague.com link every season's events by
name; `.claude/…/wpl-ga-on-gotsport` in memory lists the ones not yet taken).

| League | event | groups taken |
|---|---|---|
| WPL U11-U14 Fall | 55357 | all 56 |
| GA League | 56497 | names matching `Pac(ific)?[- ]?Northwest` — GA also has a plain "Northwest" conference, which is not ours |
| GA ASPIRE | 56498 | same pattern |

The GA events are national and list every conference; `only` on the league
row keeps it to ours. If the bookmark says *none of N groups match*, it prints
the first few names — fix the pattern in `league-bookmark.ts` to what they
actually call it.

All of these live in **`src/features/sync/league-bookmark.ts`**, which is the
one place to change them.

These change when the season does. To find next season's AthleteOne ids,
open any of the schedule pages and read them off the DOM:

```js
const b = document.getElementById('conference-schedules-container');
const ev = [...document.getElementById('event-select').options]
  .find(o => /northwest/i.test(o.textContent));
({ org: b.dataset.orgId, season: b.dataset.orgSeasonId, event: ev.value });
```

## Step 1 — collect (about five minutes, in a browser)

Print the bookmark's code — it is generated from `league-bookmark.ts`, so the
skill and the browser never hold two copies:

```
pnpm leagues:snippet              # paste into the console
pnpm leagues:snippet --bookmark   # or make a bookmark of it, once
```

**Two clicks, one on each site.** GotSport pages can only be read from their
own origin, and AthleteOne's API answers only pages on theecnl.com (its CORS
header names that origin and no other — a click on GotSport learned this as
`blocked by CORS policy`). So:

- on **any theecnl.com schedule page** → `ecnl-northwest-all.json` (six leagues)
- on **any system.gotsport.com page** → `gotsport-northwest-all.json` (WPL, GA, GA ASPIRE)

The bookmark reads whatever the site it is on allows, names the file after
it, and lists the leagues that want the other site. One league failing does
not stop the rest; its line in the note says what happened.

For each GotSport league it reads the event's front page for the groups, then
each group's "View All Matches" page (`schedules?date=All&group=<id>`), which
is the whole season on one page — the day view paginates, that one does not.
Fifty-six groups for WPL at 2.5 seconds apart is a little over two minutes.

Spaced at 2.5 seconds on purpose. Nobody asked for that, and it costs nothing.

**This is the step to run yourself.** Claude's permission classifier blocks a
loop of third-party fetches that writes to disk, and a settings rule for the
browser tool does not lift it — that is a separate layer. Claude can read the
ids (single read-only calls pass), which is why the table above exists.

## Step 2 — look before writing

```
pnpm har ~/Downloads/ecnl-northwest-all.json
pnpm har ~/Downloads/gotsport-northwest-all.json
```

Reports every fragment and its size. Two things worth a glance:

- **Fragment count.** Six ECNL leagues is 26–30 fragments; WPL adds 56, one
  per group; each GA league adds however many Northwest groups it has. Far
  fewer means a league's division list came back empty.
- **Sizes that are identical to the byte.** Rounded to K they often look
  equal and are not; if two are the same exact number, the same division was
  fetched twice.

## Step 3 — import

```
pnpm db:import:schedule --event=<slug> --file=~/Downloads/ecnl-northwest-all.json --league="ECNL RL Boys"
pnpm db:import:schedule --event=<slug> --file=… --league="ECNL RL Boys" --apply
pnpm db:import:schedule --event=<slug> --file=~/Downloads/gotsport-northwest-all.json --league="WPL" --apply
```

Which reader applies is decided by the markup, not the label: a GotSport page
(`gotsport-fragment.ts`) and an AthleteOne fragment (`athleteone-fragment.ts`)
both end at the same TSV and go through the same `applyPastedText`.

`--league` matches the **first path segment, from its start**. Anywhere-in-the-
label is wrong in the one way that matters: "pre-ecnl boys" contains "ecnl
boys", so asking for ECNL Boys would take Pre-ECNL's fixtures along with it.

The events, as they stand:

| League | event slug |
|---|---|
| ECNL Boys, ECNL Girls | `ecnl-league-northwest-conference` |
| ECNL RL Boys, ECNL RL Girls | `ecnl-rl-league-northwest-conference` |
| Pre-ECNL Boys, Pre-ECNL Girls | `pre-ecnl-league-northwest-conference` |
| WPL U11-U14 Fall | `wpl-fall-2026-u11-u14` |
| GA League | `ga-league-2026-27-northwest` |
| GA ASPIRE | `ga-aspire-2026-27-northwest` |

The three GotSport events are created by hand on `/events/new` (league,
external hosted, source link to the GotSport event) before the first import;
run `pnpm db:sync:preflight` before that first `--apply`, because a synced
team's name is written once.

Boys and girls share an event and are told apart by division, which is how the
first one was built and what the schedule page's own filters expect.

It goes through `applyPastedText`, the same path the paste box uses — the date
guard, the team binder and the idempotent write all apply. **Running it twice
changes nothing**, which is what makes this safe to do weekly: scores update in
place, and a fixture that already exists is not added again.

## Step 4 — check what landed

```sql
select coalesce(d.name,'(none)') as division,
       count(*) as matches,
       count(*) filter (where m.home_score is not null) as scored
from matches m join events e on e.id = m.event_id
left join event_divisions d on d.id = m.division_id
where e.slug = 'SLUG' group by 1 order by 1;
```

The number that should move week to week is **scored**. If `matches` moves,
the league has rescheduled something — worth reading, not worth panicking
about.

Then, if any teams arrived that no club matches:

```
pnpm db:backfill:clubs          # dry run
```

## What breaks, and how it will look

- **A fragment parses to nothing.** AthleteOne changed how it stacks a row.
  `athleteone-fragment.ts` and the bookmarklet's `a1Fixture` in `copier.ts`
  read the same markup and **both** need the change. For GotSport the header
  moved — `gotsport-fragment.ts` reads `Match # | Time | Home Team | Results |
  Away Team | Location | Division` by name, and the saved pages under
  `tests/fixtures/gotsport/` are what it was written against.
- **The bookmark says GotSport wants a captcha.** Pass it in that tab (open
  any event page) and click again.
- **A GotSport score comes out empty for a played game.** Only `-` and
  `N - N` have been seen in the Results cell (nothing had been played when
  this was written). Save the page and add the shape to the reader's test.
- **The console snippet returns 403.** The ids are from last season, or they
  changed the endpoint. Re-read the ids with the snippet at the top.
- **"That holds both a schedule and a standings table."** A standings
  fragment got into the bundle. Narrow with `--league`.
- **The date guard refuses the paste.** The event's own dates do not cover the
  season. Fix the event's dates rather than passing `--confirm-dates` — the
  guard exists because 421 fixtures once landed in the wrong tournament.

## The one thing not verified against real bytes

Score parsing was written against `a1Fixture`, which was written against real
scored data, and then checked: six ECNL Boys fixtures played on 30 August came
out `1-1, 5-1, 1-3, 3-1, 2-3, 0-4` from the fragment and matched the six
already in the database character for character — two independent paths, the
same answer. Anything beyond that shape (a forfeit, a walkover, a game marked
abandoned) has never been seen. If a score lands wrong, that is where to look.
