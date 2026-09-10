# Refreshing a league's results each week

The ECNL leagues publish a whole season at once and fill in the scores as
they are played. So this is not an import that happens once — it is a thing
to do every week, and the cost of doing it badly is that it stops happening.

Collecting the fixtures needs a person. Everything after that does not.

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

These change when the season does. To find next season's, open any of the
schedule pages and read them off the DOM:

```js
const b = document.getElementById('conference-schedules-container');
const ev = [...document.getElementById('event-select').options]
  .find(o => /northwest/i.test(o.textContent));
({ org: b.dataset.orgId, season: b.dataset.orgSeasonId, event: ev.value });
```

## Step 1 — collect (about two minutes, in a browser)

On **any** theecnl.com schedule page, in the console:

```js
const api = 'https://api.athleteone.com/api/Script';
const leagues = [
  ['ECNL Boys',      12, 81, 4284], ['ECNL Girls',      9, 80, 4268],
  ['ECNL RL Boys',   16, 83, 4353], ['ECNL RL Girls',  13, 82, 4311],
  ['Pre-ECNL Boys',  22, 87, 4385], ['Pre-ECNL Girls', 21, 86, 4384],
];
const opts = (h) => [...new DOMParser().parseFromString(h,'text/html')
  .querySelectorAll('option')].filter(o => o.value !== '0').map(o => [o.textContent.trim(), o.value]);
const out = {};
for (const [league, org, season, event] of leagues) {
  const divs = opts(await (await fetch(`${api}/get-division-list-by-event-id/${org}/${event}/0/0`)).text());
  out[league] = {};
  for (const [name, id] of divs) {
    const r = await fetch(`${api}/get-conference-schedules/${org}/${season}/${event}/${id}/0`);
    out[league][name] = await r.text();
    console.log(league, name, r.status, out[league][name].length);
    await new Promise(res => setTimeout(res, 2500));
  }
}
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], {type:'application/json'}));
a.download = 'ecnl-northwest-all.json';
a.click();
```

Spaced at 2.5 seconds on purpose. Nobody asked for that, and it costs nothing.

**This is the step to run yourself.** Claude's permission classifier blocks a
loop of third-party fetches that writes to disk, and a settings rule for the
browser tool does not lift it — that is a separate layer. Claude can read the
ids (single read-only calls pass), which is why the table above exists.

## Step 2 — look before writing

```
pnpm har ~/Downloads/ecnl-northwest-all.json
```

Reports every fragment and its size. Two things worth a glance:

- **Fragment count.** Six leagues is 26–30 fragments. Far fewer means a
  league's division list came back empty.
- **Sizes that are identical to the byte.** Rounded to K they often look
  equal and are not; if two are the same exact number, the same division was
  fetched twice.

## Step 3 — import

```
pnpm db:import:schedule --event=<slug> --file=~/Downloads/ecnl-northwest-all.json --league="ECNL RL Boys"
pnpm db:import:schedule --event=<slug> --file=… --league="ECNL RL Boys" --apply
```

`--league` matches the **first path segment, from its start**. Anywhere-in-the-
label is wrong in the one way that matters: "pre-ecnl boys" contains "ecnl
boys", so asking for ECNL Boys would take Pre-ECNL's fixtures along with it.

The events, as they stand:

| League | event slug |
|---|---|
| ECNL Boys, ECNL Girls | `ecnl-league-northwest-conference` |
| ECNL RL Boys, ECNL RL Girls | `ecnl-rl-league-northwest-conference` |
| Pre-ECNL Boys, Pre-ECNL Girls | `pre-ecnl-league-northwest-conference` |

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
  read the same markup and **both** need the change.
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
