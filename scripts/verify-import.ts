import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Whether an import landed the way it should have.
 *
 *   pnpm db:sync:verify --event=<slug>
 *
 * Reads only, and asks the database rather than downloading it: a count and
 * five examples per check. The version of this that pulled the whole teams
 * table and compared it in memory exhausted the transfer allowance and took
 * the site down for an hour.
 *
 * Run it after connecting or re-syncing a league. The work is in
 * features/sync/verify.ts; this is the way in.
 */

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const slug = arg("event");
  if (!slug) {
    console.log("Usage: pnpm db:sync:verify --event=<slug>");
    process.exit(1);
  }

  const { verifyEvent } = await import("../src/features/sync/verify");
  const report = await verifyEvent(slug);
  if (!report) {
    console.log(`No event with slug "${slug}".`);
    process.exit(1);
  }

  console.log(`${report.event.title}`);
  console.log(
    `${report.fixtures} fixtures · ${report.entries} team entries · ${report.divisions} divisions\n`,
  );

  const wrong = report.findings.filter((f) => f.count > 0 && f.severity === "wrong");
  const look = report.findings.filter((f) => f.count > 0 && f.severity === "look");
  for (const finding of report.findings) {
    const mark =
      finding.count === 0 ? "  ok  " : finding.severity === "wrong" ? "  !!  " : "  ??  ";
    console.log(`${mark}${String(finding.count).padStart(5)}  ${finding.what}`);
    for (const example of finding.examples) console.log(`             ${example}`);
  }

  if (look.length > 0) {
    console.log(
      `\n??  is worth reading, not necessarily wrong — a club the directory ` +
        `does not have\n    yet, or a team renamed after its address was made.`,
    );
  }
  console.log(
    wrong.length === 0
      ? `\nNothing here landed wrong.`
      : `\n!!  ${wrong.length} check(s) found a fault. Fixing these means writing the ` +
          `rows again:\n    pnpm db:sync:reset --event=${slug} --apply   ` +
          `(then connect or refresh)`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
