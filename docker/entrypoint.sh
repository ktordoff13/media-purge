#!/bin/sh
set -e

# Optional PUID/PGID support (linuxserver.io-style) for hosts that care about
# file ownership on the media share — Synology, TrueNAS, rootless Docker,
# bare Linux. Unset by default so existing unraid installs are unaffected:
# unraid itself doesn't need this (its shares are permissive by default) and
# the container has always run as root there.
if [ -n "$PUID" ] || [ -n "$PGID" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"

  if ! getent group "$PGID" >/dev/null 2>&1; then
    addgroup -g "$PGID" mediapurge
  fi
  GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)

  if ! getent passwd "$PUID" >/dev/null 2>&1; then
    adduser -D -H -u "$PUID" -G "$GROUP_NAME" mediapurge
  fi
  USER_NAME=$(getent passwd "$PUID" | cut -d: -f1)

  # /config holds only the sqlite db and is small — safe to chown on every
  # boot. /media and /recycle-bin are NOT chowned: they can be huge, and the
  # host is expected to already grant PUID:PGID read/write on those shares.
  chown -R "$PUID:$PGID" "$CONFIG_DIR"

  echo "Starting as ${USER_NAME:-$PUID}:${GROUP_NAME:-$PGID}"
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
