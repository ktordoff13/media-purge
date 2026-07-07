# Cleanup rules reference

Every rule is a pure function over a scanned item's snapshot. Matched rules add **points**; an
item whose total reaches the threshold (25) becomes a recommendation, ranked by score and size.
All thresholds below are the defaults — tune or disable any rule on the **Rules** page; changes
apply from the next scan.

Items are **never** suggested if they are on the protected list, carry the `keep`
label/tag on the media server, or were previously dismissed.

| Rule | Matches when | Default points |
| --- | --- | --- |
| **Never watched, aging** | 0 plays and added > 365 days ago | 40 |
| **Watched long ago** | played, but last play > 730 days ago | 25 |
| **Started but abandoned** | < 50% watched, idle > 180 days *(needs watch-progress data)* | 20 |
| **Big and unloved** | > 15 GB and ≤ 1 play | 20 |
| **Duplicate versions** | more than one file version on the server | 30 |
| **Low quality, unwatched** | SD/720p and untouched > 365 days | 15 |
| **Ended & fully watched series** | show over†, ≥ 90% watched, idle > 365 days | 25 |
| **Poorly rated, never watched** | rating < 6.0 and 0 plays | 15 |
| **Growing series nobody watches** | new episode ≤ 90 days ago but unwatched > 365 days | 30 |

† Jellyfin reports ended/continuing directly. Plex doesn't expose it, so a show with no new
episode in 2× the idle threshold is treated as ended.

## Provider differences

| | Plex | Jellyfin |
| --- | --- | --- |
| Play counts / last played | token owner's account only | **all users, aggregated** |
| Watch progress | owner only | all users (max) |
| Ended/continuing status | inferred (see †) | native |
| Duplicate detection | ✓ | ✓ |
| `keep` label exclusion | Plex labels | Jellyfin tags |

Practical consequence: on a multi-user Plex server, "never watched" means "never watched by the
token's account". Review before approving, or wait for the optional Tautulli enrichment on the
roadmap. Jellyfin has no such caveat.

## Scoring intuition

Points ≈ how confident the rule is on its own. One strong signal ("never watched for a year",
40) is enough to recommend; weak signals ("SD quality", 15) only surface when they stack with
others. Raise a rule's points to make it more decisive, lower the thresholds to make it more
aggressive.

## Custom rules (condition builder)

Beyond the built-ins, the Rules page lets you compose your own rules: pick fields, operators,
and values, combine them with ALL/ANY, and assign points — they feed the same scoring pipeline
and produce the same explainable reasons ("Play count: 0 = 0; Age (days): 212 > 180").

Available fields include everything in the snapshot plus derived values: age/idle days,
size in GB, **GB per play**, watch progress %, watched episodes %, days since a new episode,
resolution, ratings, library, labels, version count, series status.

Semantics to know:

- **Unknown never matches** — `Audience rating < 6` cannot catch an unrated item.
- **Capability-gated** — a rule using watch progress silently skips items from servers that
  don't report it (Plex without Tautulli), instead of guessing.
- **Preview before you trust it** — the editor's Preview button evaluates the rule against your
  latest scan and shows exactly what it would match and how much space that is.

Custom rules never override the safety valves: protected items, the `keep` label, and previous
dismissals always win.
