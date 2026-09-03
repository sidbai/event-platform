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
pnpm dev
```

Requires a `DATABASE_URL` in `.env.local` (Neon connection string) once the
data layer lands.
