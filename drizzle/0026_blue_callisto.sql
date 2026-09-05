CREATE TYPE "public"."like_subject" AS ENUM('forum_post', 'news_post', 'comment');--> statement-breakpoint
CREATE TABLE "likes" (
	"subject_type" "like_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_subject_type_subject_id_user_id_pk" PRIMARY KEY("subject_type","subject_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "likes_subject_idx" ON "likes" USING btree ("subject_type","subject_id");