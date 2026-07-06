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
