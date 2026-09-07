-- Two clubs the schedules kept naming that the directory did not have.
--
-- The 38 seeded clubs came from the RCL and WPL member lists, and these two
-- are in neither — but between them they field 43 teams across the
-- tournaments we read, which is more than most clubs that are listed. A club
-- page is what lets those teams be filed, carry a crest and be found by name.
--
-- league stays null on purpose: the column records which league directory
-- listed a club, and neither directory lists these. Wenatchee FA enters teams
-- as "N1", which is a WPL tier, but a division label on a team is not the
-- same as a club appearing in the directory we checked, and this column is
-- read as if somebody checked.
--
-- No crest and no website: those are not ours to invent, and the club page
-- has an editor for both. City only where the club's own name states it.

INSERT INTO clubs (slug, name, city)
VALUES ('wenatchee-fa', 'Wenatchee FA', 'Wenatchee')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO clubs (slug, name)
VALUES ('sozo-fc', 'Sozo FC')
ON CONFLICT (slug) DO NOTHING;
