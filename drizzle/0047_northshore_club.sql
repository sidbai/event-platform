-- Northshore Select Club, and the initials it enters tournaments under.
--
-- 35 teams called "NSC BU10B", "NSC Aces, BU16, Weyer" matched nothing, and
-- the guesses available inside the directory were all wrong: Norpoint, North
-- Kitsap and Northlake are three different clubs that also answer to NSC,
-- which is exactly why the matcher refused to choose. The club it actually
-- means was not in the directory at all.
--
-- Confirmed against northshoresoccer.org, which names it "Northshore Select
-- Club (NSC)". No city: the club's own page gives an area rather than one,
-- and the column is read as a fact somebody checked.
--
-- The alias is needed even with the club present. "Northshore Select Club"
-- is reachable from a team named "Northshore …" and no NSC team is.

INSERT INTO clubs (slug, name, website)
VALUES (
  'northshore-select-club',
  'Northshore Select Club',
  'https://www.northshoresoccer.org'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO club_aliases (alias, club_id)
SELECT 'nsc', id FROM clubs WHERE slug = 'northshore-select-club'
ON CONFLICT (alias) DO NOTHING;
