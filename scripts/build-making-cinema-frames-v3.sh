#!/bin/sh
set -eu
# This is an original-documentary derivative, not generated footage.
# The 8.4-second excerpt ends before the later recognizable lion sculpture.
root=public/assets
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
cat "$root"/film/making-v2-??.part > "$work/master.mp4"
test -s "$work/master.mp4"
duration="$(ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "$work/master.mp4")"
awk -v n="$duration" 'BEGIN{if(n<8.4)exit 1}'
folder="$root/making-cinema-frames-v3"
mkdir -p "$folder"
rm -f "$folder"/frame_???.webp
ffmpeg -hide_banner -loglevel error -y -ss 0 -t 8.4 -i "$work/master.mp4" \
 -an -vf "fps=144/8.4,scale='min(1600,iw)':-2:flags=lanczos" \
 -frames:v 144 -c:v libwebp -quality 84 -compression_level 4 \
 -start_number 0 "$folder/frame_%03d.webp"
n="$(find "$folder" -maxdepth 1 -name 'frame_???.webp' | wc -l | tr -d ' ')"
test "$n" -eq 144
width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nokey=1:noprint_wrappers=1 "$folder/frame_000.webp")"
test "$width" -ge 1280
sha="$(sha256sum "$work/master.mp4" | cut -c 1-64)"
printf '{"version":3,"source":"original House of Mabwe documentary master","master_sha256":"%s","frames":144,"start_seconds":0,"end_seconds":8.4,"width":%s,"method":"original 8.4 second chiseling excerpt, 144 non-interpolated native-source WebP samples"}\n' "$sha" "$width" > "$folder/manifest.json"
printf 'Original-HD documentary, %s frames, %s pixels\n' "$n" "$width"
