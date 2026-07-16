# Trying Media Purge on your unraid server

Media Purge scans your Plex/Jellyfin libraries and suggests stuff you could delete
(never watched, watched years ago, duplicates…). **It ships in "dry-run" mode: it will
not delete anything**, no matter what you click, until you deliberately switch that off.
So it's completely safe to poke around.

The only file you need is the app template. Download it from here:
**[media-purge.xml](https://raw.githubusercontent.com/ktordoff13/media-purge/main/docker/unraid-template.xml)**
(right-click → *Save link as…* and save it as `media-purge.xml`).

---

## Step 1 — Put the template file on your server

1. Save `media-purge.xml` somewhere on your computer (e.g. Downloads).
2. Open your unraid server's files from your computer:
   - **Windows:** open File Explorer and type `\\TOWER\flash` in the address bar
     (replace `TOWER` with your server's name — it's shown in the top-left of the
     unraid web page).
   - **Mac:** in Finder press **Cmd+K** and connect to `smb://TOWER/flash`.
3. Inside, open the folders: `config` → `plugins` → `dockerMan` → `templates-user`.
4. Copy `media-purge.xml` into that folder. Done.

> Can't see the `flash` share? Skip to "Plan B" at the bottom.

## Step 2 — Install the container

1. Open the unraid web page and click the **Docker** tab.
2. Click **Add Container** (bottom of the page).
3. In the **Template** dropdown at the top, pick **media-purge**.
   The form fills itself in.
4. Check the three folder settings:
   - **Config** — leave as is (`/mnt/user/appdata/media-purge`).
   - **Media** — set this to the share where your movies/TV live,
     e.g. `/mnt/user/media` or `/mnt/user/data`. Click the field and browse.
   - **Recycle Bin** — where deleted files wait for 30 days before being
     removed for real. Put it **on the same share as your media**, e.g. if your
     media is `/mnt/user/data`, use `/mnt/user/data/.media-purge-bin`.
5. Click **Apply**. Unraid downloads the app and starts it (takes a minute).

## Step 3 — Open it and connect your media server

1. In your browser go to **`http://TOWER:8484`** (again, your server's name or IP).
2. Go to **Settings → Media sources** and add your server:
   - **Plex:** you need your server URL (usually `http://TOWER:32400`) and a
     Plex token. To find the token, Plex has a help page — search
     "Plex find authentication token" or use this link:
     <https://support.plex.tv/articles/204059436>
   - **Jellyfin:** server URL (usually `http://TOWER:8096`) and an API key —
     in Jellyfin go to **Dashboard → API Keys → +** to make one.
3. Click **Save**, then use the **Test** button to check it connects.

## Step 4 — Scan and look around

1. Go to the **Dashboard** and hit **Scan now**.
2. When it finishes, check the **Recommendations** page. Every suggestion says
   *why* it thinks the item is deletable and how much space it would free.
3. Things to look at:
   - Do the play counts / "last watched" dates look right to you?
   - Does anything on the list make you go "no way, I'd never delete that"?
   - Try the **Rules** page — every rule can be tuned or switched off.
   - Try it from your phone too.

**If a scan finds your libraries but shows 0 items or wrong file sizes**, your Plex
probably sees the files at a different folder path than this app does. Go to
**Settings → Path mappings** and map them (e.g. Plex sees `/data/movies`,
this app sees `/media/movies`). Then scan again.

## What to report back

Anything, honestly — but especially: errors, empty pages, wrong numbers,
recommendations that make no sense, and anything confusing. If something breaks,
the container's **logs** help: Docker tab → click the media-purge icon → **Logs**.

Nothing is deleted in dry-run mode, so you can't break your library by exploring.

---

## Plan B — if the flash share isn't visible

You can fill in the form by hand instead:

1. **Docker** tab → **Add Container**.
2. Set **Name** to `media-purge` and **Repository** to
   `ghcr.io/ktordoff13/media-purge:latest`.
3. Click **Add another Path, Port, Variable, Label or Device** three times to add
   three **Path** entries:
   | Container Path | Host Path |
   |---|---|
   | `/config` | `/mnt/user/appdata/media-purge` |
   | `/media` | your media share, e.g. `/mnt/user/data` |
   | `/recycle-bin` | same share + `/.media-purge-bin`, e.g. `/mnt/user/data/.media-purge-bin` |
4. Add one **Port** entry: container port `8484`, host port `8484`.
5. **Apply**, then continue from Step 3 above.
