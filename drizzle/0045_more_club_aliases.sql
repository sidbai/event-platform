-- Abbreviations that reach a club already in the directory.
--
-- 514 imported teams matched no club, and a third of them are clubs we do
-- have, entered under initials a matcher cannot infer: "LWPFC" does not
-- resemble "Lake Washington Premier FC" by any rule that would not also
-- produce nonsense elsewhere. Each of these was read off the team names and
-- checked against the club list by hand.
--
-- Deliberately not here: NSC (35 teams — Norpoint, North Kitsap and
-- Northlake all answer to it), MRFC, CWS, HSA, IFC and FME, whose clubs
-- either are not in the directory or cannot be told apart from the initials.
-- A wrong alias silently re-labels every future import, so the ones in doubt
-- wait for someone who knows.
--
-- Matched on slug, since ids differ between databases. ON CONFLICT DO NOTHING
-- so a re-run, or an alias an admin has already set from the queue, stands.

INSERT INTO club_aliases (alias, club_id)
SELECT v.alias, c.id
FROM (VALUES
  -- NW United BU10 Red Briseno
  ('nwunited',  'northwest-united-fc'),
  -- WW SURF BU11 ACADEMY CENTRAL B
  ('wwsurf',    'western-washington-surf'),
  -- WE SURF SC BU15 MLS NEXT — Washington East, as against WW for Western
  ('wesurf',    'washington-east-surf-soccer-club'),
  -- LWPFC B16/17 White Barracudas
  ('lwpfc',     'lake-washington-premier-fc'),
  -- BVBIA Seattle U11EA, and BVBIA WA-EASTSIDE
  ('bvbia',     'bvb-international-academy-washington'),
  -- HPFC EA 2012/13 (WA), BU14, Zwaller
  ('hpfc',      'highline-premier-fc'),
  -- ECFC - U12 - White
  ('ecfc',      'emerald-city-fc'),
  -- KAFC BU11 White
  ('kafc',      'kitsap-alliance-fc')
) AS v(alias, slug)
JOIN clubs c ON c.slug = v.slug
ON CONFLICT (alias) DO NOTHING;
