#!/usr/bin/env bash
# Puts each piece of the game's music (apps/web/public/music) over its cover (apps/web/public/brand/cover-*.png) as a
# 2560 × 1440 still-image MP4 for YouTube, written to media/music-videos. Needs ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
out=media/music-videos
mkdir -p "$out"
for pair in "hearth:01-ocak-basinda:01-by-the-hearth" "crusade:02-kudus-yolunda:02-the-road-to-jerusalem" \
  "england:03-kralin-cayirlari:03-the-kings-meadows" "horizon:04-ufuktaki-sancaklar:04-banners-on-the-horizon" \
  "jig:05-sarhos-ejder-hani:05-the-drunken-dragon-inn"; do
  IFS=: read -r id mp3 name <<<"$pair"
  ffmpeg -y -loglevel error -loop 1 -framerate 24 -i "apps/web/public/brand/cover-$id.png" -i "apps/web/public/music/$mp3.mp3" \
    -c:v libx264 -tune stillimage -preset medium -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart \
    "$out/$name.mp4"
  echo "wrote $out/$name.mp4"
done
