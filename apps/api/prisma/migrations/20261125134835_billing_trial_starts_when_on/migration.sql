-- A trial now starts when billing is switched on, not when the column arrived. Until then it is
-- empty, and the app fills in 14 days from that moment for every workspace, old or new. Both
-- billing migrations ship in the same release, so no workspace has had a trial yet.
ALTER TABLE "workspaces" ALTER COLUMN "trial_ends_at" DROP NOT NULL,
ALTER COLUMN "trial_ends_at" DROP DEFAULT;

UPDATE "workspaces" SET "trial_ends_at" = NULL;
