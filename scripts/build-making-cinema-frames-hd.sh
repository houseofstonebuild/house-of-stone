#!/bin/sh
set -eu
# Extract an early, shape-neutral carving passage from the original HD documentary,
# never from the old 640x360 delivery encode. The late lion footage is excluded.
root="public/assets"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
cat "$root"/film/making-v2-??.part > "$work/master.mp4"
master="$work/master.mp4"
length="$(ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "$master")"
awk -v seconds="$length" 'BEGIN {if (seconds < 8.4) exit 1}'
video="$root/making-chiseling-atelier-hd-v2.mp4"
frames="$root/making-cinema-frames-v2"
mkdir -p "$frames"
# Source-preserving resize (cap width, no enlargement) and frequent keyframes
# for reversible scroll seeking on desktop.
ffmpeg -hide_banner -loglevel error -y -ss 0 -t 8.4 -i "$master" -an \
  -vf "scale='min(1920,iw)':-2:flags=lanczos,format=yuv420p" -r 24 \
  -c:v libx264 -preset medium -crf 18 -g 6 -keyint_min 6 -sc_threshold 0 \
  -movflags +faststart "$video"
width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nokey=1:noprint_wrappers=1 "$video")"
if [ "$width" -lt 1280 ]; then
  echo "Original master has insufficient true resolution: $width" >&2
  exit 1
fi
rm -f "$frames"/frame_??.webp
ffmpeg -hide_banner -loglevel error -y -i "$video" \
  -vf "fps=48/8.4,scale='min(1600,iw)':-2:flags=lanczos" \
  -frames:v 48 -c:v libwebp -quality 86 -compression_level 5 \
  -start_number 0 "$frames/frame_%02d.webp"
count="$(find "$frames" -maxdepth 1 -name 'frame_??.webp' | wc -l | tr -d ' ')"
test "$count" -eq 48
frame_width="$(ffprobe -v error -show_entries stream=width -select_streams v:0 -of default=nokey=1:noprint_wrappers=1 "$frames/frame_00.webp")"
test "$frame_width" -ge 1280
master_sha="$(sha256sum "$master" | cut -c 1-64)"
printf '{"version":2,"source":"original multipart House of Mabwe HD documentary","master_sha256":"%s","frames":48,"start_seconds":0,"end_seconds":8.4,"width":%s,"method":"short unaltered early carving interval, source-native high resolution, quality-86 individual WebP frames"}\n' "$master_sha" "$frame_width" > "$frames/manifest.json"
printf 'HD carving: %s pixels, 8.4 seconds, %s frames\n' "$width" "$count"
