# King Juan Soccer

Seattle youth soccer events platform. Event is the core object — games,
scrimmages, pickup, tournaments, watch parties, meetups, tryouts — one
generic container with modules switched on per event.

See [`docs/architecture.html`](docs/architecture.html) for the full design:
data model, component choices, hosting, and the King Juan Cup migration plan.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Postgres on Neon, Drizzle ORM
- Deployed on Vercel

## Develop

```bash
pnpm install
cp .env.example .env.local   # then set DATABASE_URL
pnpm db:migrate
pnpm db:seed                 # loads King Juan Cup 2026
pnpm dev
```

`DATABASE_URL` is a Neon pooled connection string, or a local Postgres.

### Local Postgres (Homebrew)

```bash
brew install postgresql@17
LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@17/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@17 -o "-p 54329" -l /tmp/pg.log start
/opt/homebrew/opt/postgresql@17/bin/createdb -p 54329 king_juan_soccer
# DATABASE_URL="postgresql://<you>@127.0.0.1:54329/king_juan_soccer"
```

Stop it with `pg_ctl -D /opt/homebrew/var/postgresql@17 stop`.

## Scripts

| | |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm db:generate` | generate a migration from `src/db/schema.ts` |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:push` | push schema without a migration (dev only) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | seed King Juan Cup 2026 |
