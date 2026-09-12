import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * How good the forecasts are, against the games they learned from.
 *
 *   pnpm predict:eval
 *
 * Reads only. Replays every decided game in order, forecasting each from
 * the ratings as they stood before it, and scores the calls where both
 * sides had the history the page requires. Run it after touching elo.ts;
 * a change that does not move these numbers is not an improvement.
 */
async function main() {
  const { modelRecord } = await import("../src/features/predict/queries");
  const r = await modelRecord();
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  console.log(`${r.games} decided games; ${r.scored} forecast (both sides with history)\n`);
  console.log(`  accuracy   model ${pct(r.accuracy)}   base rates ${pct(r.accuracyBase)}`);
  console.log(`  Brier      model ${r.brier.toFixed(3)}   base rates ${r.brierBase.toFixed(3)}   (lower is better)`);
  console.log(`  base rates home ${pct(r.base.home)} · draw ${pct(r.base.draw)} · away ${pct(r.base.away)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
