#!/bin/sh
set -eu

# GitHub mounts its home for pwuser, while container actions run as root.
# Firefox rejects that combination. Use the image's existing account without
# overriding HOME or weakening browser authentication/sandbox settings.
if [ "${QA_ENGINE:-chromium}" = firefox ] && [ "$(id -u)" -eq 0 ] && id pwuser >/dev/null 2>&1; then
  mkdir -p test-results/browser
  chown pwuser:pwuser test-results/browser
  exec runuser -u pwuser -- node "$@"
fi
exec node "$@"
