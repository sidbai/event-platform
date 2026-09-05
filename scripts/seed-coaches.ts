import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { slugify } from "../src/lib/slug";

// Must run before the db module is loaded — see seed-clubs for why.
config({ path: ".env.local" });

/**
 * Senior coaching and technical staff at the largest Seattle clubs.
 *
 * These are real, named people on pages that carry reviews of them, so the
 * bar is higher than for clubs: every name and title below is copied from the
 * club's own published staff page, verbatim, and nothing is inferred.
 *
 * Only coaching and technical roles are listed. Each club's staff page also
 * names administrators, registrars, uniform coordinators, a business
 * development manager and an athletic trainer — none of them coach anybody,
 * and putting them where parents rate coaching would invite reviews of people
 * for a job they do not do.
 *
 * Team coaches are included as role "coach", the enum value added for exactly
 * this: it is what the clubs publish, and Head or Assistant would be a rank
 * nobody gave them.
 */
const COACHES: {
  clubSlug: string;
  name: string;
  /** Verbatim from the club's page, for the record. */
  title: string;
  role: "head" | "assistant" | "coach" | "director";
  ageGroups: string[];
}[] = [
  // --- Crossfire Premier — crossfiresoccer.org/coaches/directors ---------
  { clubSlug: "crossfire-premier", name: "Bernie James", title: "Director of Coaching", role: "director", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Leo Maric", title: "Technical Director", role: "director", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Kevin Legg", title: "Girls ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Eddie Henderson", title: "Boys ECNL Director", role: "director", ageGroups: [] },

  // --- Seattle United — seattleunited.com/leadership ---------------------
  { clubSlug: "seattle-united", name: "Logan Emory", title: "ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Lauren Barnes", title: "Assistant Girls ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Bastien Catrin", title: "Assistant Boys ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Alex Chursky", title: "Technical Director, U10-U12 Boys & Girls Premier Director", role: "director", ageGroups: ["U10-U12"] },
  { clubSlug: "seattle-united", name: "Paul Aur", title: "U13-U19 Boys & Girls Premier Director", role: "director", ageGroups: ["U13-U19"] },
  { clubSlug: "seattle-united", name: "Jason McGlothern", title: "U8-U9 Boys & Girls Juniors Director", role: "director", ageGroups: ["U8-U9"] },
  { clubSlug: "seattle-united", name: "Sean Russell", title: "Director, Northwest Region", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "George Singh", title: "Director, South Region", role: "director", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Ed Moore", title: "Director, Shoreline Region / Goalkeeper Director", role: "director", ageGroups: [] },

  // --- Eastside FC — eastsidefc.org/coaches ------------------------------
  { clubSlug: "eastside-fc", name: "Tom Bialek", title: "Director of Soccer", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Anderson Prestes", title: "Director of Programming", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Troy Letherman", title: "Boys ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Tim Reynolds", title: "Girls ECNL Director", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Claire Knock", title: "DOC, Girls U13-U19 ECNL RL/RCL", role: "director", ageGroups: ["U13-U19"] },
  { clubSlug: "eastside-fc", name: "Porter Lombard", title: "DOC, Boys U13-U19 ECNL RL/RCL", role: "director", ageGroups: ["U13-U19"] },
  { clubSlug: "eastside-fc", name: "Andrew Dortch", title: "DOC, EFC West", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Sean Morris", title: "DOC, West Maroon", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Erin Vaughan", title: "DOC, Girls West Maroon", role: "director", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Joe Mondello", title: "Director of Goalkeeping", role: "director", ageGroups: [] },

  // --- Team coaches, from each club's own published staff list. ---------
  //
  // Titled plainly "Coach" because that is what the clubs publish; inventing
  // Head or Assistant would put a rank on real people that nobody gave them.
  //
  // Deduplicated per club: a coach listed against four teams is one person.
  // Where a club's own page spells a name two ways, one spelling is chosen and
  // recorded here — Nick Radosavljevic (also Radosalvjevic, Radosalvjec),
  // Cade Cooke (Cade Cook), Tolossa Hassan (Hasan), Lucas Isaacson (Issacson),
  // Abdella Hussein (Hussien), Dawda Dibba (Dwada), Jesse Winship-Freyer
  // (Winship-Freye).
  //
  // Several people appear on both a leadership page and a team sheet — Steve
  // Crum, Devin Rairdon, Carlos Enriquez, Carson Pingrey, Amy James-Turner,
  // Tyler Robbins. They coach teams, so they belong here.
  // --- Crossfire Premier — crossfiresoccer.org/coaches/team-coaches -----
  { clubSlug: "crossfire-premier", name: "Mandou Bojang", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Aaron Burns", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Arby Busey", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Malie Chamberland", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Alan Carloza", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Steve Crum", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Javier Cruz", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Ibrahima Drame", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Travers Enslow", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Jon Ellis", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Rikky Falagan", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Andrew \"AJ\" Gonzales", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "John Heimbigner", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Ebrima \"EJ\" Jatta", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Angedd Kalsi", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Kevin McGibbon", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Tony Mercado", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Mark Metzger", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Wayde Olson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Dante Perez Martin", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Ethan Peterson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Marko Plackov", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Sydney Pluhacek", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Slavo Rafailovic", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Devin Rairdon", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Brooke Reece", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Richard Reece", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Jim Rilatt", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Amadou Sanyang", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "crossfire-premier", name: "Erik Storkson", title: "Coach", role: "coach", ageGroups: [] },

  // --- Eastside FC — eastsidefc.org/coaches -----------------------------
  { clubSlug: "eastside-fc", name: "Tony Armitage", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Justi Baumgardt", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Hector Betancourt", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Diego Betancourt", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Jeff Betts", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Diego Botello", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "John Buttle", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Josh Chasan", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Hannah Deighton", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Nick Ewing", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Elliot Fauske", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Kelvin Galvez", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Nick Games", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Nathan Gehrke", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Quinn Grisham", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Lucas Hasenmyer", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "John Hernandez", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Liam Jalalian", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Alieu Kamara", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Wilson Kasinga", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Victor King", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Mark Kovats", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Loren Langley", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Mario Martinez", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Mike Mata", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Ellis McLoughlin", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Ahmed Mohammed", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Akira Nandate", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Debbie Nelson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Orlando Neto", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Terrell Norris", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Cary Pruitt", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Sean Rash", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Scott Song", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Shaun Spencer", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Tsigab Tesfamariam", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Jodi Ulkekul", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Todd Veenhuizen", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Tariq Walcott", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "David Wharton", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "eastside-fc", name: "Jordan Zimmerman", title: "Coach", role: "coach", ageGroups: [] },

  // --- Seattle United — boys-team-staff and girls-team-staff -------------
  { clubSlug: "seattle-united", name: "Nick Radosavljevic", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Tyler Robbins", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Cade Cooke", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Bill Wilkins", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Andy Westmark", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Dylan Butt", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Josh Dodd", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Ashkanov Apollon", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Conner Pichette", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Justin Richardson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Jacob Anson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Tyler Costa", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Dan Renn", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Carlos Enriquez", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Dawda Dibba", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Sean Kettle", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Connor Barton", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Drew Williams", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Kim Huntamer", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Bryce Garceau", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Jim Whitlock", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Brandon Foster", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Tolossa Hassan", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Jon Erickson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Aryeh Cohen", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Danny Calles", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Idi Diallo", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Randy Johnson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Brandon Eaton", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Mark Szabo", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Sena Alkadir", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Dan Strom", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Justin Rosgen", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Alex Santiago Cortez", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Eli Ricord", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Alec Duxbury", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Lucas Isaacson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Sam Adelman", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Daniel Swayne", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Josh Bishop", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Meelod Shaterian", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Enoch Gidudu", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Andrei Zahajko", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Abdella Hussein", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Ellis Miyaoka", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Zach Butters", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Jesse Winship-Freyer", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Mario Sibaja Vargas", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Brian Mathieson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Mo Wishkowski", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Haley Yeager", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Rachel Moran", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Cary Tanaka", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Kayla Kraft", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Carson Pingrey", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Alma Mana'o", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Jackie Harris", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Ryan Peterson", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Liz White", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Lisa Blume", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Mike Aelfikadu", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Sergio Fajardo", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Austin Rodgers", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Eddy Reif", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Nicole Tomita", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Amy James-Turner", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Josef Mayor", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Owusu Fordjour", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Austin Ochoa", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Jeremy Wentzel", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Chris Ruiz", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Cam Iftiger", title: "Coach", role: "coach", ageGroups: [] },
  { clubSlug: "seattle-united", name: "Britt Blomso", title: "Coach", role: "coach", ageGroups: [] },
];

async function main() {
  const { db } = await import("../src/db");
  const { clubs, coaches, coachEdits } = await import("../src/db/schema");

  let added = 0;
  let skipped = 0;
  const missingClubs = new Set<string>();

  for (const c of COACHES) {
    const club = await db.query.clubs.findFirst({
      where: eq(clubs.slug, c.clubSlug),
      columns: { id: true },
    });
    if (!club) {
      missingClubs.add(c.clubSlug);
      continue;
    }

    // Slug carries the club, so two clubs may each have a Chris Smith.
    const slug = slugify(`${c.name} ${c.clubSlug}`).slice(0, 60);
    const existing = await db.query.coaches.findFirst({
      where: eq(coaches.slug, slug),
      columns: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const [created] = await db
      .insert(coaches)
      .values({
        slug,
        name: c.name,
        clubId: club.id,
        role: c.role,
        ageGroups: c.ageGroups,
      })
      .returning({ id: coaches.id });

    // Baseline snapshot so the entry's history is reachable from the start,
    // the same shape createCoach writes.
    await db.insert(coachEdits).values({
      coachId: created.id,
      editedBy: null,
      name: c.name,
      role: c.role,
      ageGroups: c.ageGroups,
      summary: `Seeded from the club's staff page as ${c.title}`,
    });
    added++;
  }

  console.log(`Coaches: ${added} added, ${skipped} already present.`);
  if (missingClubs.size > 0) {
    console.log(`No such club (skipped): ${[...missingClubs].join(", ")}`);
  }
  process.exit(0);
}

void main();
