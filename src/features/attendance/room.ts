/**
 * Whether there is room for one more "going".
 *
 * The one rule capacity has, kept out of the action so it can be read and
 * tested on plain numbers. A person already going is changing their guests
 * or their note, not taking a new place, so their own heads are not counted
 * against them; a person moving up from maybe is. "Maybe" is never refused
 * — it is the answer for when there is no room.
 */
export function roomFor(input: {
  status: "going" | "maybe";
  existing: "going" | "maybe" | null;
  capacity: number | null;
  /** People plus guests already going, including this person if they are. */
  headcount: number;
  /** Heads this person already holds, when they are already going. */
  mine: number;
  guests: number;
}): boolean {
  if (input.status !== "going" || input.capacity == null) return true;
  const others = input.existing === "going" ? input.headcount - input.mine : input.headcount;
  return others + 1 + input.guests <= input.capacity;
}
