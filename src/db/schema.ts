import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Schema so far: auth (Auth.js), tournament core (events, teams, matches …).
 * Media, discussion, registrations and sponsors get their own tables later —
 * for now the event ruleset, sponsor list and champions ride in
 * `events.metadata`.
 */

export const eventStatus = pgEnum("event_status", [
  "draft",
  "pending",
  "published",
  "cancelled",
  "completed",
]);

export const eventVisibility = pgEnum("event_visibility", [
  "public",
  "unlisted",
  "private",
]);

export const locationType = pgEnum("location_type", [
  "in_person",
  "online",
  "hybrid",
]);

export const matchStage = pgEnum("match_stage", ["group", "ko"]);

export const offerStatus = pgEnum("offer_status", [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
]);

export const matchStatus = pgEnum("match_status", [
  "scheduled",
  "live",
  "final",
  "forfeit",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// --- auth (Auth.js / @auth/drizzle-adapter) -----------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"), // from Google
  // profile
  username: text("username").unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"), // custom upload; falls back to `image`
  tags: text("tags").array().notNull().default([]),
  /**
   * Stable pseudonym shown on club reviews. Generated on first review so
   * existing accounts get one lazily. Global rather than per-club, so one
   * person's reviews are linkable to each other but not to their account.
   */
  anonHandle: text("anon_handle").unique(),
  club: text("club"),
  bio: text("bio"),
  city: text("city"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// --- event_kinds: editable catalog of event kinds -------------------------

export const eventKinds = pgTable("event_kinds", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  icon: text("icon"),
  defaultModules: text("default_modules").array().notNull().default([]),
  sort: integer("sort").notNull().default(0),
  description: text("description"),
});

// --- venues --------------------------------------------------------------

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  notes: text("notes"),
  mapUrl: text("map_url"),
  ...timestamps,
});

// --- events: the core object --------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    kind: text("kind")
      .notNull()
      .references(() => eventKinds.slug),
    modules: text("modules").array().notNull().default([]),
    title: text("title").notNull(),
    titleZh: text("title_zh"),
    summary: text("summary"),
    status: eventStatus("status").notNull().default("draft"),
    visibility: eventVisibility("visibility").notNull().default("public"),
    /**
     * Set by an admin to take an event down. Distinct from visibility and from
     * cancelling: visibility is the organizer's to change, and cancelled means
     * "not happening" rather than "removed". Only an admin can lift this, so
     * an organizer cannot re-list a banned event by flipping it to unlisted
     * and sharing the link.
     */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),

    locationType: locationType("location_type").notNull().default("in_person"),
    venueId: uuid("venue_id").references(() => venues.id),
    onlineUrl: text("online_url"),

    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone"),

    ageGroup: text("age_group"),
    gender: text("gender"),
    format: text("format"),
    level: text("level"),
    capacity: integer("capacity"),

    organizerId: uuid("organizer_id").references(() => users.id),
    /**
     * The team this event belongs to, if any. Distinct from home/away team,
     * which say who is *playing*; this says who *owns* it — the team's
     * owner/manager/coach can manage it, and its members can see it even when
     * it is private, without individual invites.
     */
    /*
     * The explicit AnyPgColumn return type is load-bearing. teams already
     * references events (originEventId), so pointing back at teams here closes
     * a type cycle; without the annotation TypeScript gives up and every
     * inferred query type in the schema silently degrades to `any`.
     */
    hostTeamId: uuid("host_team_id").references((): AnyPgColumn => teams.id, {
      onDelete: "set null",
    }),
    needsOpponent: boolean("needs_opponent").notNull().default(false),
    homeTeamId: uuid("home_team_id"),
    awayTeamId: uuid("away_team_id"),
    result: jsonb("result"),

    host: text("host"),
    discussionLocked: boolean("discussion_locked").notNull().default(false),
    metadata: jsonb("metadata"),
    ...timestamps,
  },
  (t) => [
    index("events_status_starts_at_idx").on(t.status, t.startsAt),
    index("events_kind_idx").on(t.kind),
  ],
);

// --- teams: team-centric identity --------------------------------------

export const teamVisibility = pgEnum("team_visibility", ["private", "public"]);

/** Regional Club League and Washington Premier League, in ranked order. */
export const clubLeague = pgEnum("club_league", ["rcl", "wpl"]);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  club: text("club"),
  ageGroup: text("age_group"),
  gender: text("gender"),
  city: text("city"),
  crestUrl: text("crest_url"),
  bio: text("bio"),
  // 'private' = created for an event, hidden from the public directory;
  // 'public' = a standalone club profile. Claiming a private team promotes it.
  visibility: teamVisibility("visibility").notNull().default("public"),
  originEventId: uuid("origin_event_id").references(() => events.id, {
    onDelete: "set null",
  }),
  /**
   * Whoever runs the team. Set at creation; an admin can hand it to someone
   * else. Null only for a team auto-created for an event, until an admin
   * transfers it to the coach who actually runs it.
   */
  ownerId: uuid("owner_id").references(() => users.id),
  ...timestamps,
});

// --- event_divisions: brackets within a tournament --------------------

export const eventDivisions = pgTable(
  "event_divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    label: text("label"),
    birthYears: integer("birth_years").array().notNull().default([]),
    format: text("format"),
    rosterMin: integer("roster_min"),
    rosterMax: integer("roster_max"),
  },
  (t) => [unique("event_divisions_event_name_uq").on(t.eventId, t.name)],
);

// --- event_teams: roster slot + standings ----------------------------

export const eventTeams = pgTable(
  "event_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    divisionId: uuid("division_id").references(() => eventDivisions.id),
    seed: integer("seed"),
    groupLabel: text("group_label"),
    played: integer("played").notNull().default(0),
    won: integer("won").notNull().default(0),
    drawn: integer("drawn").notNull().default(0),
    lost: integer("lost").notNull().default(0),
    gf: integer("gf").notNull().default(0),
    ga: integer("ga").notNull().default(0),
    points: integer("points").notNull().default(0),
  },
  (t) => [unique("event_teams_event_team_uq").on(t.eventId, t.teamId)],
);

// --- rosters: players for an event_teams row ------------------------

export const rosters = pgTable("rosters", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventTeamId: uuid("event_team_id")
    .notNull()
    .references(() => eventTeams.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  birthYear: integer("birth_year"),
  gender: text("gender"),
  note: text("note"),
});

// --- matches: one game -------------------------------------------------

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => eventDivisions.id),
    stage: matchStage("stage").notNull().default("group"),
    round: text("round"),
    groupLabel: text("group_label"),
    field: text("field"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    homeTeamId: uuid("home_team_id").references(() => teams.id),
    awayTeamId: uuid("away_team_id").references(() => teams.id),
    homePlaceholder: text("home_placeholder"),
    awayPlaceholder: text("away_placeholder"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: matchStatus("status").notNull().default("scheduled"),
  },
  (t) => [index("matches_event_idx").on(t.eventId)],
);

// --- relations ------------------------------------------------------

export const eventsRelations = relations(events, ({ one, many }) => ({
  venue: one(venues, { fields: [events.venueId], references: [venues.id] }),
  hostTeam: one(teams, {
    fields: [events.hostTeamId],
    references: [teams.id],
    // events->teams and teams->events are both `one`; without explicit names
    // drizzle tries to pair them into one relation and gives up, which turns
    // every inferred query type in the schema into `any`.
    relationName: "eventHostTeam",
  }),
  kind: one(eventKinds, { fields: [events.kind], references: [eventKinds.slug] }),
  divisions: many(eventDivisions),
  eventTeams: many(eventTeams),
  matches: many(matches),
}));

export const eventDivisionsRelations = relations(eventDivisions, ({ one, many }) => ({
  event: one(events, { fields: [eventDivisions.eventId], references: [events.id] }),
  eventTeams: many(eventTeams),
  matches: many(matches),
}));

export const eventTeamsRelations = relations(eventTeams, ({ one, many }) => ({
  event: one(events, { fields: [eventTeams.eventId], references: [events.id] }),
  team: one(teams, { fields: [eventTeams.teamId], references: [teams.id] }),
  division: one(eventDivisions, {
    fields: [eventTeams.divisionId],
    references: [eventDivisions.id],
  }),
  roster: many(rosters),
}));

export const rostersRelations = relations(rosters, ({ one }) => ({
  eventTeam: one(eventTeams, {
    fields: [rosters.eventTeamId],
    references: [eventTeams.id],
  }),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  event: one(events, { fields: [matches.eventId], references: [events.id] }),
  division: one(eventDivisions, {
    fields: [matches.divisionId],
    references: [eventDivisions.id],
  }),
  homeTeam: one(teams, { fields: [matches.homeTeamId], references: [teams.id] }),
  awayTeam: one(teams, { fields: [matches.awayTeamId], references: [teams.id] }),
}));

/**
 * owner/manager administer the team (edit it, invite people).
 * coach can also put events on the team's calendar.
 * player is membership only — sees the team's private events, can RSVP.
 */
export const teamRole = pgEnum("team_role", [
  "owner",
  "manager",
  "coach",
  "player",
]);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull().default("manager"),
    addedBy: uuid("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  eventTeams: many(eventTeams),
  members: many(teamMembers),
  originEvent: one(events, {
    fields: [teams.originEventId],
    references: [events.id],
    relationName: "teamOriginEvent",
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

// --- event_offers: responses to "looking for opponent" -----------------

export const eventOffers = pgTable(
  "event_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    fromTeamId: uuid("from_team_id")
      .notNull()
      .references(() => teams.id),
    byUserId: uuid("by_user_id")
      .notNull()
      .references(() => users.id),
    message: text("message"),
    status: offerStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("event_offers_event_team_uq").on(t.eventId, t.fromTeamId)],
);

export const eventOffersRelations = relations(eventOffers, ({ one }) => ({
  event: one(events, { fields: [eventOffers.eventId], references: [events.id] }),
  fromTeam: one(teams, { fields: [eventOffers.fromTeamId], references: [teams.id] }),
}));

// --- news: editorial posts ---------------------------------------------

export const newsCategory = pgEnum("news_category", [
  "news",
  "recap",
  "guide",
  "announcement",
]);

export const newsStatus = pgEnum("news_status", [
  "draft",
  "pending",
  "published",
]);

/**
 * An editorial article. Anyone signed in may write one; an admin decides what
 * actually appears on /news, the same shape as the pending-event queue.
 *
 * Distinct from forum_posts on purpose: the community forum is anyone's to
 * post in and needs no approval, this is the site speaking. Comments reuse the
 * polymorphic discussion, so a news post gets the same thread, moderation and
 * reporting as everything else.
 */
export const newsPosts = pgTable(
  "news_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    /** Shown on the index and used as the meta description. */
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    coverUrl: text("cover_url"),
    category: newsCategory("category").notNull().default("news"),
    status: newsStatus("status").notNull().default("draft"),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Null until first published; drives ordering and the visible date. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /**
     * Why an admin sent a submission back. Shown to the author on their own
     * post so a rejection is actionable rather than a silent bounce.
     */
    reviewNote: text("review_note"),
    ...timestamps,
  },
  (t) => [index("news_posts_published_idx").on(t.status, t.publishedAt)],
);

export const newsPostsRelations = relations(newsPosts, ({ one }) => ({
  author: one(users, { fields: [newsPosts.authorId], references: [users.id] }),
}));

// --- clubs and club reviews --------------------------------------------

/**
 * Who the reviewer is relative to the club. Shown on every review, because a
 * coach's view of a club and a parent's are different claims and readers
 * should be able to tell them apart. It is self-declared — we can't verify it
 * the way Blind verifies a work email — so it is disclosure, not proof.
 */
export const reviewerRole = pgEnum("reviewer_role", ["parent", "player", "coach"]);

export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /**
   * Held at the top of the directory by an admin.
   *
   * The clubs most families are actually choosing between, so the first page
   * is not simply whatever sorts first alphabetically. Same shape as
   * forum_posts.pinned, and set only from the admin page — the seeder must
   * never write it, or an unpin would be undone on the next run.
   */
  pinned: boolean("pinned").notNull().default(false),
  /**
   * The league directory this club was listed in.
   *
   * Not a complete account of where a club plays — a big club fields teams
   * across several leagues at once — but it is the list families use to place
   * a club, and it is what the seeder can state from a source it checked.
   * Null means neither directory listed it.
   */
  league: clubLeague("league"),
  city: text("city"),
  website: text("website"),
  crestUrl: text("crest_url"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  /**
   * Whoever last changed the club's details. Club entries are community
   * maintained — anyone signed in can correct one — so edits need to be
   * attributable, both to show readers the page is tended and to make
   * vandalism traceable.
   */
  updatedBy: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
  ...timestamps,
});

/**
 * A snapshot of a club's details after each change, so community edits can be
 * undone.
 *
 * Stores the resulting state rather than a diff: reverting is then just
 * writing an older snapshot back, and the history stays append-only — a revert
 * is itself an edit, never a deletion. Every club gets a baseline row so its
 * original details are always reachable.
 */
export const clubEdits = pgTable(
  "club_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    editedBy: uuid("edited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    city: text("city"),
    website: text("website"),
    crestUrl: text("crest_url"),
    /** What the editor did, for a readable history line. */
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("club_edits_club_idx").on(t.clubId, t.createdAt)],
);

export const clubEditsRelations = relations(clubEdits, ({ one }) => ({
  club: one(clubs, { fields: [clubEdits.clubId], references: [clubs.id] }),
  editor: one(users, { fields: [clubEdits.editedBy], references: [users.id] }),
}));

/** How a coach is involved with the club, for display only. */
export const coachRole = pgEnum("coach_role", [
  "head",
  "assistant",
  /**
   * Plain "Coach" — what most clubs actually publish. Without it, seeding a
   * club's staff list means inventing "Head" or "Assistant" for real people
   * whose club gave them neither.
   */
  "coach",
  "director",
]);

/**
 * A coach, always in the context of a club.
 *
 * Deliberately not a free-floating person page. Scoping a coach to the club
 * they work for keeps the subject a professional role rather than an
 * individual, which is the whole basis on which reviewing a named person is
 * defensible. There is no photo column for the same reason.
 *
 * Community maintained like clubs: anyone signed in can correct an entry, and
 * coach_edits keeps every version so vandalism is reversible and attributable.
 */
export const coaches = pgTable(
  "coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    role: coachRole("role").notNull().default("head"),
    /** e.g. {"Boys 2013","Girls 2014"} — what they actually coach. */
    ageGroups: text("age_groups").array(),
    /**
     * The person this entry is about, once an admin has confirmed it.
     *
     * Set only through the claim queue — never self-serve, because claiming a
     * coach page is claiming the right to answer reviews about a named person.
     * The holder can reply to reviews and nothing else: not edit them, not hide
     * them, and not review themselves.
     */
    claimedBy: uuid("claimed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("coaches_club_idx").on(t.clubId)],
);

export const claimStatus = pgEnum("claim_status", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * A request to be recognised as the coach an entry describes.
 *
 * Kept as its own table rather than a flag so the decision is on the record:
 * who asked, what they said, who decided and when. Rejected claims stay,
 * because a pattern of someone trying to claim a page that is not theirs is
 * exactly what an admin needs to see.
 */
export const coachClaims = pgTable(
  "coach_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** How they say we can tell it is them. Not shown publicly. */
    note: text("note"),
    status: claimStatus("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One open or settled request per person per coach; asking again edits it.
    unique("coach_claims_coach_user_uq").on(t.coachId, t.userId),
    index("coach_claims_status_idx").on(t.status, t.createdAt),
  ],
);

/** A snapshot of a coach's details after each change. Mirrors club_edits. */
export const coachEdits = pgTable(
  "coach_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    editedBy: uuid("edited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    role: coachRole("role").notNull(),
    ageGroups: text("age_groups").array(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coach_edits_coach_idx").on(t.coachId, t.createdAt)],
);

export const coachesRelations = relations(coaches, ({ one }) => ({
  club: one(clubs, { fields: [coaches.clubId], references: [clubs.id] }),
}));

export const coachEditsRelations = relations(coachEdits, ({ one }) => ({
  coach: one(coaches, { fields: [coachEdits.coachId], references: [coaches.id] }),
  editor: one(users, { fields: [coachEdits.editedBy], references: [users.id] }),
}));

/**
 * Which kind of thing a review is about.
 *
 * 'coach' is declared ahead of the coaches table: adding an enum value later
 * has to COMMIT before anything can use it, which forces a separate migration,
 * so the cheap move is to name every subject up front.
 */
export const reviewSubject = pgEnum("review_subject", ["club", "coach"]);

/**
 * One person's review of one subject.
 *
 * Polymorphic on (subject_type, subject_id) like `discussions`, so a coach or
 * a venue can be reviewed without a second copy of this table, its votes and
 * its reports. There is deliberately no foreign key on subject_id — that is
 * the cost of the pattern, and it means whatever deletes a subject has to
 * delete its reviews too.
 *
 * Scores live in `ratings` as JSON because the scales differ per subject: a
 * club is judged on six, a coach on a different five. The 1-5 rule is still
 * enforced in the database, by review_ratings_valid().
 *
 * Reviews are shown anonymously: `authorId` exists so a person can edit their
 * own review and only review a subject once, and is never exposed to readers —
 * the display name comes from users.anonHandle instead.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: reviewSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Scale key -> 1-5. Which keys are expected depends on subjectType. */
    ratings: jsonb("ratings").$type<Record<string, number>>().notNull(),

    reviewerRole: reviewerRole("reviewer_role").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),

    /*
     * Context, required for coach reviews and unused by club ones.
     *
     * This is what makes a review an experience report rather than a verdict:
     * "we worked with this coach, Boys 2013, 2025-26" is answerable and
     * scoped, where "he is terrible" is neither. It is also what a reader
     * needs to judge how much the review applies to them.
     */
    teamLabel: text("team_label"),
    season: text("season"),
    yearsWith: integer("years_with"),
    /** The 👍/👎. Degrades better than a mean at low volume. */
    recommends: boolean("recommends"),

    /** Set by an admin, or automatically once a coach review is reported
     * enough times; hides it without destroying the record. */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("reviews_subject_author_uq").on(t.subjectType, t.subjectId, t.authorId),
    index("reviews_subject_idx").on(t.subjectType, t.subjectId, t.hiddenAt),
    check("reviews_ratings_ck", sql`review_ratings_valid(${t.ratings})`),
  ],
);

/** "Helpful" votes. One per person per review. */
export const reviewVotes = pgTable(
  "review_votes",
  {
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] })],
);

export const reviewReports = pgTable(
  "review_reports",
  {
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.reporterId] })],
);

/**
 * The subject's public answer to a review. At most one per review.
 *
 * The single biggest fairness lever in the whole feature: someone reviewed by
 * name can say their side, in the same place, without the review being edited
 * or taken down. Keyed on the review rather than the subject so a club could
 * answer one later without another table.
 *
 * It never carries anything about who wrote the review — replying must not
 * become a way to work out who is talking.
 */
export const reviewReplies = pgTable("review_replies", {
  reviewId: uuid("review_id")
    .primaryKey()
    .references(() => reviews.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  ...timestamps,
});

export const reviewRepliesRelations = relations(reviewReplies, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewReplies.reviewId],
    references: [reviews.id],
  }),
}));

export const coachClaimsRelations = relations(coachClaims, ({ one }) => ({
  coach: one(coaches, { fields: [coachClaims.coachId], references: [coaches.id] }),
  user: one(users, { fields: [coachClaims.userId], references: [users.id] }),
}));

export const clubsRelations = relations(clubs, ({ one }) => ({
  // No `reviews` relation: the join needs subject_type as well, which drizzle
  // relations cannot express, and without it a coach review whose subject_id
  // collided with a club id would be counted as the club's. Reviews are
  // fetched explicitly instead.
  updatedByUser: one(users, {
    fields: [clubs.updatedBy],
    references: [users.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  author: one(users, { fields: [reviews.authorId], references: [users.id] }),
  votes: many(reviewVotes),
  reports: many(reviewReports),
}));

export const reviewVotesRelations = relations(reviewVotes, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewVotes.reviewId],
    references: [reviews.id],
  }),
}));

export const reviewReportsRelations = relations(reviewReports, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewReports.reviewId],
    references: [reviews.id],
  }),
}));

/**
 * Fixed-window counters for rate limiting.
 *
 * Postgres rather than Redis on purpose: Neon sits in the same region as the
 * functions, every request already makes a DB call for the session, and the
 * limits that matter here are per-user-per-day rather than per-second. One
 * more indexed upsert is cheaper than another vendor, another secret and
 * another failure mode.
 *
 * The primary key is what makes the counter safe under concurrency — an
 * INSERT ... ON CONFLICT DO UPDATE increments in a single statement, with no
 * read-then-write race.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** Which allowance, e.g. 'review:create'. */
    bucket: text("bucket").notNull(),
    /** Who it applies to. Always a user id — every write here is signed in. */
    subject: text("subject").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.bucket, t.subject, t.windowStart] }),
    // Supports the sweep that drops expired windows.
    index("rate_limits_window_idx").on(t.windowStart),
  ],
);

/**
 * What a conversation is about.
 *
 * Conversations are always scoped to something both people already share.
 * There is deliberately no 'user' subject: an open inbox between arbitrary
 * accounts would be a private adult-to-minor channel by default on a youth
 * sports site, and nothing here records who is a minor. 'offer' is declared
 * now because adding an enum value later needs its own migration.
 */
export const conversationSubject = pgEnum("conversation_subject", [
  "event",
  "team",
  "offer",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: conversationSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    startedBy: uuid("started_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Drives inbox ordering without counting messages on every read. */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_subject_idx").on(t.subjectType, t.subjectId)],
);

/**
 * Who is in a conversation. Membership is the whole access rule — there is no
 * separate visibility flag, so a thread cannot be readable by someone who was
 * never added to it.
 */
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null until they open it; drives the unread badge. */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_participants_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    /** Set by an admin acting on a report; hides without destroying it. */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const messageReports = pgTable(
  "message_reports",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.reporterId] })],
);

/**
 * One person refusing contact from another.
 *
 * Directional: blocking stops them starting a conversation with you and stops
 * them posting into one you are in. It does not erase what was already said —
 * an admin still needs the history to judge a report.
 */
export const messageBlocks = pgTable(
  "message_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
}));

/**
 * What can be hearted.
 *
 * Every value is declared up front even though only forum posts use them
 * today: adding an enum value later has to commit before anything can use it,
 * which forces its own migration.
 */
export const likeSubject = pgEnum("like_subject", [
  "forum_post",
  "news_post",
  "comment",
]);

/**
 * One heart from one person.
 *
 * The primary key is the whole business rule — someone can like a thing once,
 * and un-liking is a delete, so there is no count to drift out of step with
 * who actually pressed it.
 */
export const likes = pgTable(
  "likes",
  {
    subjectType: likeSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectType, t.subjectId, t.userId] }),
    index("likes_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

// --- invites -----------------------------------------------------------

export const inviteStatus = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
]);

/**
 * An invitation to a private/unlisted event.
 *
 * Targets either a registered user or a bare email address — exactly one, per
 * the check constraint. An email invite is stored normalized (see
 * normalizeEmail) and is claimed when someone signs in with a matching
 * address. `token` backs a shareable link, which is how invites travel until
 * transactional email exists.
 */
export const eventInvites = pgTable(
  "event_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    email: text("email"),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: inviteStatus("status").notNull().default("pending"),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    unique("event_invites_event_user_uq").on(t.eventId, t.invitedUserId),
    unique("event_invites_event_email_uq").on(t.eventId, t.email),
    index("event_invites_email_idx").on(t.email),
    check(
      "event_invites_target_ck",
      sql`(${t.invitedUserId} is null) <> (${t.email} is null)`,
    ),
  ],
);

/**
 * An invitation to join a team, in a given role. Same targeting rules as
 * eventInvites; accepting writes the team_members row.
 */
export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    email: text("email"),
    // Least privilege if anything ever forgets to pass one.
    role: teamRole("role").notNull().default("player"),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: inviteStatus("status").notNull().default("pending"),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    unique("team_invites_team_user_uq").on(t.teamId, t.invitedUserId),
    unique("team_invites_team_email_uq").on(t.teamId, t.email),
    index("team_invites_email_idx").on(t.email),
    check(
      "team_invites_target_ck",
      sql`(${t.invitedUserId} is null) <> (${t.email} is null)`,
    ),
  ],
);

export const teamInvitesRelations = relations(teamInvites, ({ one }) => ({
  team: one(teams, { fields: [teamInvites.teamId], references: [teams.id] }),
  invitedUser: one(users, {
    fields: [teamInvites.invitedUserId],
    references: [users.id],
  }),
}));

export const eventInvitesRelations = relations(eventInvites, ({ one }) => ({
  event: one(events, { fields: [eventInvites.eventId], references: [events.id] }),
  invitedUser: one(users, {
    fields: [eventInvites.invitedUserId],
    references: [users.id],
  }),
}));

// --- attendance: the `attendance` module ------------------------------

export const attendanceStatus = pgEnum("attendance_status", ["going", "maybe"]);

/**
 * Who is coming to an event. Backs the `attendance` module (pickup, meetup,
 * watch-party, custom). One row per person per event; clearing an RSVP deletes
 * the row rather than storing a "not going" state.
 */
export const eventAttendees = pgTable(
  "event_attendees",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull().default("going"),
    guests: integer("guests").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("event_attendees_event_idx").on(t.eventId, t.status),
  ],
);

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, {
    fields: [eventAttendees.eventId],
    references: [events.id],
  }),
  user: one(users, { fields: [eventAttendees.userId], references: [users.id] }),
}));

// --- posts: Youth Soccer Weekly ---------------------------------------

export const postStatus = pgEnum("post_status", ["draft", "published"]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  intro: text("intro").notNull().default(""),
  status: postStatus("status").notNull().default("draft"),
  featuredEventIds: uuid("featured_event_ids").array().notNull().default([]),
  authorId: uuid("author_id").references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- discussion: polymorphic threads on events / teams / posts ---------

export const discussionSubject = pgEnum("discussion_subject", [
  "event",
  "team",
  "post",
  "forum_post",
  "news_post",
]);

// --- forum: standalone community discussions --------------------------

export const forumCategory = pgEnum("forum_category", [
  "general",
  "looking-for-players",
  "looking-for-teams",
  "coaching",
  "tournaments",
  "logistics",
  "feedback",
]);

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: forumCategory("category").notNull().default("general"),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    /**
     * Set by an admin to take a post out of the feed without destroying it.
     *
     * Deleting was the only moderation option here, which is out of step with
     * comments, reviews and messages — and irreversible, so a mistake could
     * not be undone and a wrongly-removed post left no record.
     */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    /**
     * Set when the author turns the post into an event. The discussion moves
     * with it, the post drops out of the forum feed, and its slug redirects to
     * the event.
     */
    convertedEventId: uuid("converted_event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("forum_posts_activity_idx").on(t.pinned, t.lastActivityAt)],
);

export const forumPostsRelations = relations(forumPosts, ({ one }) => ({
  author: one(users, { fields: [forumPosts.authorId], references: [users.id] }),
  convertedEvent: one(events, {
    fields: [forumPosts.convertedEventId],
    references: [events.id],
  }),
}));

export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: discussionSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    locked: boolean("locked").notNull().default(false),
    pinnedCommentId: uuid("pinned_comment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("discussions_subject_uq").on(t.subjectType, t.subjectId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: uuid("hidden_by").references(() => users.id),
    reportCount: integer("report_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_discussion_idx").on(t.discussionId)],
);

export const commentReports = pgTable(
  "comment_reports",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const discussionsRelations = relations(discussions, ({ many }) => ({
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  discussion: one(discussions, {
    fields: [comments.discussionId],
    references: [discussions.id],
  }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comment_replies",
  }),
  replies: many(comments, { relationName: "comment_replies" }),
}));
