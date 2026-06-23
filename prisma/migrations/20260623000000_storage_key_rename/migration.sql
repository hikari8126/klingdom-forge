-- R2 object storage: storedPath now holds a relative storage key, not a disk path.
-- Rename the columns in place (forward-only; existing values become stale but kept).
ALTER TABLE "Asset" RENAME COLUMN "storedPath" TO "storageKey";
ALTER TABLE "LibraryVideo" RENAME COLUMN "storedPath" TO "storageKey";
