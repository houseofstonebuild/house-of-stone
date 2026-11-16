#!/bin/sh
set -eu
# Keep the original documentary's early carving passage. Do not interpolate
# imaginary footage or include the recognizable sculpture shown later.
root=public/assets
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
cat "$root"/film/making-v2-??.part > "$tmp/documentary.mp4"
test -s "$tmp/documentary.mp4"
ffprobe -v error -show_entries stream=width,height,avg_frame_rate -select_streams v:0 \
 -of default=noprint_wrappers=1 "$tmp/documentary.mp4"
dir="$root/making-cinema-frames-v4"
mkdir -p "$dir"
rm -f "$dir"/frame_???.webp
ffmpeg -hide_banner -loglevel error -y -ss 0 -t 8.4 -i "$tmp/documentary.mp4" \
 -an -vf "fps=200/8.4,scale='min(1600,iw)':-2:flags=lanczos" \
 -frames:v 200 -c:v libwebp -quality 84 -compression_level 4 \
 -start_number 0 "$dir/frame_%03d.webp"
n="$(find "$dir" -maxdepth 1 -name 'frame_???.webp' | wc -l | tr -d ' ')"
test "$n" -eq 200
w="$(ffprobe -v error -select_streams v:0 -show_entries stream=width \
 -of default=nokey=1:noprint_wrappers=1 "$dir/frame_000.webp")"
test "$w" -ge 1280
sha="$(sha256sum "$tmp/documentary.mp4" | cut -c 1-64)"
printf '{"version":4,"source":"original House of Mabwe documentary master","master_sha256":"%s","frames":200,"start_seconds":0,"end_seconds":8.4,"width":%s,"method":"200 unaltered early carving samples at source-level temporal resolution"}\n' "$sha" "$w" > "$dir/manifest.json"
