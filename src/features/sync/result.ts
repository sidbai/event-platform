/**
 * What an import or a sync reports back.
 *
 * Its own file because both a server action and a script return it, and a
 * "use server" module cannot be the home of a shared type without every
 * caller dragging next/navigation in behind it.
 */

export type ConnectResult = {
  error?: string;
  /** What the sync did, when it worked: "128 matches, 34 new teams, 0 removed". */
  detail?: string;
  /**
   * The paste was refused only because its dates are not this event's, and
   * saying so again would get it in. The form turns this into a tick-box:
   * an admin who knows better is one click away, and an admin who pasted
   * into the wrong form is told before it writes anything.
   */
  confirmDates?: boolean;
};
