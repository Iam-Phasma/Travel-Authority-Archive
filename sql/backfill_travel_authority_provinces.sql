-- One-time backfill for public.travel_authorities.province.
-- Unmatched destinations are classified as Others, matching the dashboard chart.
UPDATE public.travel_authorities
SET province = CASE
  WHEN lower(destination) ~ '(cavite|bacoor|dasmariñas|dasmarinas|imus|tagaytay|general trias|trece martires|tanza|silang)' THEN 'Cavite'
  WHEN lower(destination) ~ '(laguna|calamba|santa rosa|biñan|binan|los baños|los banos|san pedro|cabuyao|pagsanjan|san pablo)' THEN 'Laguna'
  WHEN lower(destination) ~ '(batangas|lipa|tanauan|nasugbu|lemery|bauan)' THEN 'Batangas'
  WHEN lower(destination) ~ '(antipolo|cainta|taytay|angono|binangonan|pililla|cardona)' THEN 'Rizal'
  WHEN lower(destination) ~ '(lucena|tayabas|quezon province|sariaya|tiaong|gumaca|infanta)' THEN 'Quezon'
  ELSE 'Others'
END
WHERE province IS NULL;

-- Inspect unmatched destinations before deciding whether they need more keywords.
-- SELECT destination FROM public.travel_authorities WHERE province = 'Others' ORDER BY destination;