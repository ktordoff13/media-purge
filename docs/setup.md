# Setup guide

## 1. Install

**unraid:** use `docker/unraid-template.xml` (Community Applications submission pending). Map:

- `/config` → appdata (database + settings)
- `/media` → your media share, **read-write**
- `/recycle-bin` → a folder **on the same share as your media** (instant moves)
- optionally `/plex-appdata` → Plex's appdata, for the PhotoTranscoder cache purge

**Anywhere else:** see the `docker run` in the README.

## 2. Connect your server(s)

Settings → **Media sources** → Add.

- **Plex** — URL like `http://192.168.1.10:32400` and an `X-Plex-Token`
  (Plex Web → play any item → ⋮ → Get Info → View XML → copy `X-Plex-Token` from the URL).
- **Jellyfin** — URL like `http://192.168.1.10:8096` and an **admin API key**
  (Dashboard → Advanced → API Keys). Admin is required so watch state can be aggregated across
  every user.

Hit **Test** — you should see the server name and version.

## 3. Path mappings

Read [path-mapping.md](path-mapping.md). Get this right before disabling dry-run.

## 4. Scan and review

Dashboard → **Scan now**. Scanning is read-only against your media server. When it finishes,
the **Recommendations** page lists candidates with the rules that matched them. Approve, dismiss,
or protect. While **dry-run** is on (the default) approvals only log what *would* happen —
check the Activity page to confirm the resolved file paths look right.

## 5. Go live

Settings → General → turn off dry-run. From now on: approve → files move to the recycle bin →
purged automatically after the retention window (default 30 days). Restore anything from the
Recycle Bin page until then.

Optional:

- **Schedule** — cron expression in Settings → General (e.g. `0 3 * * 0` = Sundays 03:00).
- **Radarr/Sonarr** — Settings → Integrations; approved items are unmonitored so they don't
  get re-downloaded.
- **Maintenance** — the Maintenance page can purge Plex's PhotoTranscoder cache and Jellyfin's
  `cache/` directory on disk (each needs its appdata mounted + Settings → Appdata paths) and
  trigger Plex/Jellyfin server-side housekeeping tasks, which need no mounts at all.
- **Local AI regret check (fun, optional)** — run Ollama (or any OpenAI-compatible server) on
  your LAN, enable it in Settings → Integrations with the server URL and model name, and new
  scans get playful "you might regret deleting this" notes on recommendations. Or trigger it
  manually with the "AI regret check" button. Display-only; never changes scores.
- **API** — full OpenAPI docs at `http://<host>:8484/api/docs`. Set an API key under
  Settings → Security if the container is reachable beyond your LAN.
