#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into an Argus install dir — never delete an unrelated
# /usr/bin/argus a user or other package may own.
set -e

link="/usr/bin/argus"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/Argus/*|/opt/argus/*|/opt/argus/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
