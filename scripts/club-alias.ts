import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Record that a club is also called something.
 *
 *   pnpm db:clubs:alias --club=three-rivers-soccer-club --alias='3RSC'
 *   pnpm db:clubs:alias --club=three-rivers-soccer-club --alias='3RSC' --apply
 *
 * For a form of a club's name that shares no words with it, which is the only
 * kind the matcher cannot reach on its own. The work is in
 * features/clubs/alias.ts. This is the way in.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const clubSlug = arg("club");
  const text = arg("alias");
  if (!clubSlug || !text) {
    console.log("Usage: pnpm db:clubs:alias --club=<slug> --alias='<text>' [--apply]");
    process.exit(1);
  }

  const { planAlias, recordAlias } = await import("../src/features/clubs/alias");

  const plan = await planAlias(clubSlug, text);
  if (!plan) {
    console.log(`No club with slug "${clubSlug}".`);
    process.exit(1);
  }

  console.log(`"${text}" → ${plan.club.name}   (stored as "${plan.alias}")\n`);

  if (plan.heldBy && plan.heldBy.slug !== plan.club.slug) {
    console.log(`  Refused: that alias already belongs to ${plan.heldBy.name}.`);
    console.log(`  Moving it would hand this club that one's teams on the next import.`);
    process.exit(1);
  }
  if (plan.heldBy) {
    console.log(`  Already recorded against this club. Nothing to do.`);
    process.exit(0);
  }
  if (plan.reaches) {
    console.log(
      `  The matcher already reaches ${plan.reaches.name} for this text` +
        (plan.reaches.slug === plan.club.slug
          ? `, so this changes nothing — recording it anyway is harmless.`
          : `. Recording this takes it away from them, which is the point — read that name.`),
    );
  } else {
    console.log(`  Nothing reaches this text today, so those teams land under no club.`);
  }

  if (!APPLY) {
    console.log(`\nDry run. Pass --apply to write.`);
    process.exit(0);
  }

  await recordAlias(plan);
  console.log(`\nDone. Imports naming "${text}" now find ${plan.club.name}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
