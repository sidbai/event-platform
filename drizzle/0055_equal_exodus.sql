CREATE TYPE "public"."view_subject" AS ENUM('event', 'news_post', 'forum_post');--> statement-breakpoint
CREATE TABLE "page_views" (
	"subject_type" "view_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_views_subject_type_subject_id_pk" PRIMARY KEY("subject_type","subject_id")
);
