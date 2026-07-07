# Path mapping — the one setting you must get right

Media Purge deletes files through **its own** filesystem, but your media server reports paths
in **its** container's namespace. On unraid these rarely match.

## Example

| Where | How the share is mounted |
| --- | --- |
| unraid host | `/mnt/user/media` |
| Plex container | `/mnt/user/media` → `/data` |
| Media Purge container | `/mnt/user/media` → `/media` |

Plex reports `Movie.mkv` as `/data/movies/Movie.mkv`. Media Purge must translate that to
`/media/movies/Movie.mkv` before it can move the file.

**Settings → Path mappings → add:** `from: /data` → `to: /media`. Longest matching prefix wins,
so you can have both `/data` → `/media` and `/data/kids` → `/kids-media`.

If both containers mount the share at the identical path, leave mappings empty.

## Safety check

On approval, Media Purge verifies the item's files are actually reachable before touching
anything. If none are found you get an error pointing here instead of a bogus "deleted" — a
wrong mapping can never silently delete the wrong file, but a *technically valid* mapping that
points at the wrong tree could. Test with dry-run mode on (the default) and read the activity
log's `[DRY RUN]` entries to confirm the resolved paths look right before going live.

## Recycle bin placement

Put the recycle bin **on the same share/pool as your media** (e.g.
`/mnt/user/media/.media-purge-bin`). Moves are then instant renames. If it lives on another
filesystem every "move to bin" becomes a full copy + delete — slow for 50 GB remuxes and
temporarily doubles the space used.
