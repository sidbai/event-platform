CREATE TABLE "club_review_reports" (
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_review_reports_review_id_reporter_id_pk" PRIMARY KEY("review_id","reporter_id")
);
--> statement-breakpoint
CREATE TABLE "club_review_votes" (
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_review_votes_review_id_user_id_pk" PRIMARY KEY("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"player_development" integer NOT NULL,
	"coaching" integer NOT NULL,
	"communication" integer NOT NULL,
	"club_culture" integer NOT NULL,
	"playing_time" integer NOT NULL,
	"value" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_reviews_club_author_uq" UNIQUE("club_id","author_id"),
	CONSTRAINT "club_reviews_ratings_ck" CHECK ("club_reviews"."player_development" between 1 and 5 and "club_reviews"."coaching" between 1 and 5
          and "club_reviews"."communication" between 1 and 5 and "club_reviews"."club_culture" between 1 and 5
          and "club_reviews"."playing_time" between 1 and 5 and "club_reviews"."value" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"website" text,
	"crest_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anon_handle" text;--> statement-breakpoint
ALTER TABLE "club_review_reports" ADD CONSTRAINT "club_review_reports_review_id_club_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."club_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_review_reports" ADD CONSTRAINT "club_review_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_review_votes" ADD CONSTRAINT "club_review_votes_review_id_club_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."club_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_review_votes" ADD CONSTRAINT "club_review_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reviews" ADD CONSTRAINT "club_reviews_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_reviews" ADD CONSTRAINT "club_reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_reviews_club_idx" ON "club_reviews" USING btree ("club_id","hidden_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_anon_handle_unique" UNIQUE("anon_handle");