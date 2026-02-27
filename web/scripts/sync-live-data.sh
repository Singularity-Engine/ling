#!/bin/bash
# Sync live data from sngxai-platform landing API to web/src/data/live/
# Run before build or on a schedule.

set -e

SOURCE_DIR="${SNGXAI_API_DIR:-/Users/caoruipeng/Projects/sngxai-platform/infra/landing/api}"
TARGET_DIR="$(dirname "$0")/../src/data/live"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory not found: $SOURCE_DIR"
  echo "Set SNGXAI_API_DIR to override."
  exit 1
fi

mkdir -p "$TARGET_DIR"

for file in status.json decisions.json; do
  if [ -f "$SOURCE_DIR/$file" ]; then
    cp "$SOURCE_DIR/$file" "$TARGET_DIR/$file"
    echo "Synced $file ($(wc -c < "$SOURCE_DIR/$file" | tr -d ' ') bytes)"
  else
    echo "Warning: $SOURCE_DIR/$file not found, skipping"
  fi
done

# feed.json: strip unused fields (tweet_id, title) to reduce bundle size
if [ -f "$SOURCE_DIR/feed.json" ]; then
  if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
with open('$SOURCE_DIR/feed.json') as f:
    data = json.load(f)
slim = [{'id':e['id'],'ts':e['ts'],'type':e['type'],'text':e['text'],'url':e.get('url',''),'day':e['day']} for e in data]
with open('$TARGET_DIR/feed.json','w') as f:
    json.dump(slim, f, separators=(',',':'))
"
    echo "Synced feed.json (slim: $(wc -c < "$TARGET_DIR/feed.json" | tr -d ' ') bytes, original: $(wc -c < "$SOURCE_DIR/feed.json" | tr -d ' ') bytes)"
  else
    cp "$SOURCE_DIR/feed.json" "$TARGET_DIR/feed.json"
    echo "Synced feed.json ($(wc -c < "$SOURCE_DIR/feed.json" | tr -d ' ') bytes) — install python3 for slim mode"
  fi
fi

echo "Live data synced to $TARGET_DIR"
