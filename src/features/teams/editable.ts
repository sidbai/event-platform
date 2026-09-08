/**
 * What the person who claimed a team may change about it — pure, so the rule
 * is one thing rather than a condition repeated in a form, an action and an
 * admin screen.
 *
 * A club team's identity belongs to the club, not to whoever is running it
 * this season. Eastside FC GU12 Red is the same team when every player has
 * moved on: the club, the birth years, the gender, the tier and the crest are
 * the club's facts, and a coach with a claim is not the person who gets to
 * restate them.
 *
 * What that leaves a claim is the operational half — who is on the team, what
 * it plays, what it says about itself. That is the useful half anyway: it is
 * what nobody can do today.
 *
 * The name is the exception, and it is one on purpose. Imported names are
 * whatever a platform published — "XF, U14, B12 - 13, RCL 1, Plackov" — so
 * refusing to let anybody fix them would leave the directory reading like a
 * database dump forever. It changes by proposal instead: the coach writes
 * what people actually call the team, an admin approves it. Rare enough that
 * the queue stays short, checked enough that nobody renames a club's team
 * into something the club would not recognise.
 */

/** Fields of a team that this module has an opinion about. */
export type TeamField =
  | "name"
  | "club"
  | "birthYears"
  | "gender"
  | "tier"
  | "program"
  | "city"
  | "ageGroup"
  | "crest"
  | "bio"
  | "visibility";

export type EditPolicy =
  /** Write it directly. */
  | "free"
  /** Write a proposal; an admin decides. */
  | "review"
  /** Not this person's to change — the club's, or an admin's. */
  | "locked";

export type EditableTeam = {
  /** 'unknown' | 'club' | 'independent' — see teams.affiliation. */
  affiliation: string;
};

export type Editor =
  /** Somebody whose claim was approved: a manager, and nothing more. */
  | { kind: "claimant" }
  /** An admin, or later a club's own administrator. */
  | { kind: "admin" };

/**
 * The identity of a club's team, which the club owns.
 *
 * Not the displayed age group: "U13" is a fact about a season, worked out
 * from the birth years, and it moves on its own every August.
 */
const IDENTITY: TeamField[] = [
  "club",
  "birthYears",
  "gender",
  "tier",
  "program",
  "city",
  "ageGroup",
  "crest",
];

export function policyFor(
  field: TeamField,
  team: EditableTeam,
  editor: Editor,
): EditPolicy {
  // An admin is the escape hatch for every one of these, including the name —
  // otherwise a bad import could only be fixed by somebody who does not exist
  // yet, and a team would be stuck with it.
  if (editor.kind === "admin") return "free";

  /*
   * Visibility is not on this list at all, for anyone below an admin.
   *
   * It used to ride along with the rest of the form, which meant an approved
   * claim could take a team with a season of results and hide it from the
   * directory outright. Removing a team from public view is not an edit; it
   * is the one action here that looks, from outside, exactly like the team
   * never existed.
   */
  if (field === "visibility") return "locked";

  if (field === "name") return "review";

  if (IDENTITY.includes(field)) {
    /*
     * Locked only once somebody has said which club it is.
     *
     * The imported majority are 'unknown', and the person claiming one is
     * usually the only person who knows the answer — so they may complete it.
     * Completing it is what closes it: once the team belongs to a club, the
     * club's facts are the club's to state.
     */
    return team.affiliation === "club" ? "locked" : "free";
  }

  return "free";
}

/** The fields this editor may write straight away. */
export function freeFields(team: EditableTeam, editor: Editor): TeamField[] {
  return ALL_FIELDS.filter((f) => policyFor(f, team, editor) === "free");
}

/** The fields this editor may only propose. */
export function proposableFields(team: EditableTeam, editor: Editor): TeamField[] {
  return ALL_FIELDS.filter((f) => policyFor(f, team, editor) === "review");
}

const ALL_FIELDS: TeamField[] = [
  "name",
  "club",
  "birthYears",
  "gender",
  "tier",
  "program",
  "city",
  "ageGroup",
  "crest",
  "bio",
  "visibility",
];

/**
 * Why a field is not editable here, for the form to say out loud.
 *
 * A disabled input with no explanation reads as a bug, and the person looking
 * at it is the coach of the team — the one person who most deserves to be
 * told who does get to change it.
 */
export function lockedBecause(field: TeamField, team: EditableTeam): string {
  if (field === "visibility") {
    return "Only an admin can hide a team from the directory.";
  }
  if (team.affiliation === "club") {
    return "This is the club's to set — ask the club, or an admin.";
  }
  return "Not editable here.";
}
