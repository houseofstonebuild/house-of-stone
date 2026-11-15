#!/bin/sh
set -eu
# Real-frame build: archive footage only, never simulated hands.
source_file="public/assets/making-chiseling-scrub-v1.mp4"
output_dir="public/assets/making-cinema-frames"
mkdir -p "$output_dir"
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
duration="$(ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "$source_file")"
fps="$(awk -v dur="$duration" 'BEGIN { if (dur <= 0) exit 1; printf "%.5f", 49.0/dur }')"
rm -f "$output_dir"/frame_??.webp
ffmpeg -hide_banner -loglevel error -y -i "$source_file" \
  -vf "fps=${fps},scale=800:-2:flags=lanczos" \
  -frames:v 48 -c:v libwebp -quality 77 -compression_level 5 \
  -start_number 0 "$output_dir/frame_%02d.webp"
count="$(find "$output_dir" -maxdepth 1 -name 'frame_??.webp' | wc -l | tr -d ' ')"
if [ "$count" -ne 48 ]; then
  echo "Incorrect real workshop frame count: $count (expected 48)" >&2
  exit 1
fi
source_sha="$(sha256sum "$source_file" | cut -c 1-64)"
printf '{"source":"%s","source_sha256":"%s","frames":48,"duration_seconds":%s,"width":800,"method":"evenly sampled original workshop video; no generative content"}\n' \
 "$source_file" "$source_sha" "$duration" > "$output_dir/manifest.json"
echo "Built 48 authentic workshop frames at 800px; source duration ${duration}s"
