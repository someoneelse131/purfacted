-- R24 incentive hardening: the REFUTED author penalty drops from -15 to -2
-- (refuting a false claim is a platform success, not a failure to punish).
-- Only touch the row if it still holds the old default, so an operator-tuned
-- value set via the admin panel is preserved.
UPDATE "config" SET value = '-2' WHERE key = 'rep.fact_refuted' AND value = '-15';
