# Media Purge

**Rule-based media cleanup for Plex & Jellyfin.** Scan your libraries, get explainable
recommendations for what to delete (never watched, watched years ago, duplicates, low quality,
dead series…), and reclaim storage through a staged, reversible pipeline — built to run as an
unraid Community Applications container.

No AI. Every recommendation is produced by plain heuristics you can read, tune, or disable, and
every action is written to a permanent activity log: *what* was deleted, *when*, and *why*.

## Features

- **Plex and Jellyfin, first-class.** Neutral provider layer — a `media_source` per server, scan
  as many as you like. Jellyfin gets true cross-user watch aggregation out of the box; Plex
  reports the token owner's stats (optional Tautulli enrichment is on the roadmap).
- **9 tunable built-in rules + a custom rule builder** — compose your own conditions (field/operator/value, ALL/ANY, points) over the scan data with live preview, feeding the same scoring system — items are ranked by how strong the case is
  and how much space they free. Rules that need data your server can't provide disable themselves.
- **Safety first.** Ships with **dry-run ON**. Deletion is staged: approve → files move to a
  recycle bin → purged only after a retention window (default 30 days). Restore anytime before
  purge. Protected list + `keep` label support for never-touch items.
- **Sonarr/Radarr aware.** On approval the matching entry is unmonitored so the *arrs don't
  re-download what you just deleted.
- **Server maintenance (ImageMaid-style).** Purge Plex's PhotoTranscoder cache (commonly
  50–100+ GB), trigger Clean Bundles / Optimize Database / Empty Trash, and run Jellyfin's
  cache/transcode/DB-optimize tasks — from the Maintenance page.
- **Nice UI, documented API.** Angular 22 + Material dark UI; NestJS 11 API with full
  OpenAPI/Swagger docs at `/api/docs`. SQLite keeps everything in one file in `/config`.

## Quick start (Docker)

```bash
docker build -f docker/Dockerfile -t media-purge .
docker run -d --name media-purge \
  -p 8484:8484 \
  -v /mnt/user/appdata/media-purge:/config \
  -v /mnt/user/media:/media \
  -v /mnt/user/media/.media-purge-bin:/recycle-bin \
  media-purge
```

Open `http://<host>:8484`, add your server under **Settings → Media sources**, set **path
mappings** if your media server sees the share at a different path (see
[docs/path-mapping.md](docs/path-mapping.md)), then hit **Scan now**.

On unraid, use the template in [`docker/unraid-template.xml`](docker/unraid-template.xml).

## Development

Requires Node ≥ 24.15 (`.nvmrc` provided).

```bash
npm install
npm run dev        # API on :3000 (+ Swagger at /api/docs), web on :4200 (proxied)
npm test           # rule engine + path mapping unit tests
npm run build
```

Repo layout: `apps/api` (NestJS 11), `apps/web` (Angular 22), `docker/`, `docs/`.

## The rules

See [docs/rules.md](docs/rules.md) for the full reference. Summary: never watched & aging ·
watched long ago · started-but-abandoned · big and unloved · duplicate versions · low quality
unwatched · ended & fully watched series · poorly rated & never played · growing series nobody
watches. Each has tunable thresholds and points; items past the score threshold become
recommendations.

## Roadmap

- Tautulli enrichment for Plex (true multi-user history) — optional, never required
- Webhook/Discord notifications ("scan found 214 GB reclaimable")
- Storage trend charts (scan snapshots are already stored)
- Household keep/delete voting before purge
- Overseerr/Jellyseerr context (who requested it)
- Emby provider (the abstraction already supports it)

## License

MIT
