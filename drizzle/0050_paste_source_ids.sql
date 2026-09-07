-- Drop the division from the ids the paste importer wrote.
--
-- Teams were keyed "<division>|<name>", so a side that played a group stage
-- and then a championship bracket arrived under two division headings and
-- became two team rows in one event — 54 groups in production, every one of
-- them a bracket. The importer now keys on the name alone.
--
-- Without this the fix would make things worse rather than better: the next
-- sync computes "<name>" as the id, matches none of the stored
-- "<division>|<name>" entries, and creates a third row for every team.
--
-- Only ids the paste importer made. A platform's own id is whatever the
-- platform says and is left alone; none of them contains a pipe.
UPDATE event_teams
SET source_team_id = split_part(source_team_id, '|', 2)
WHERE source_team_id LIKE '%|%';
