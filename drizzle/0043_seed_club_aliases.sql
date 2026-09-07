-- The names Crossfire enters tournaments under.
--
-- "Crossfire" reaches the club through its own name; "XF" reaches nothing —
-- two letters, in no directory, on 103 teams. The owner's rule is that
-- anything Crossfire is XF and both are Crossfire Premier, so it is written
-- down here rather than waiting to be re-derived by whoever next opens the
-- queue. Matched on slug, since ids differ between databases.
INSERT INTO club_aliases (alias, club_id)
SELECT 'xf', id FROM clubs WHERE slug = 'crossfire-premier'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO club_aliases (alias, club_id)
SELECT 'crossfire', id FROM clubs WHERE slug = 'crossfire-premier'
ON CONFLICT (alias) DO NOTHING;

-- Seattle United's affiliates enter as "Seattle United NW" and
-- "Seattle United - South"; the leading two words are the club either way.
INSERT INTO club_aliases (alias, club_id)
SELECT 'seattleunited', id FROM clubs WHERE slug = 'seattle-united'
ON CONFLICT (alias) DO NOTHING;
