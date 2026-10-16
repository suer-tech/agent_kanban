#!/bin/bash
set -euo pipefail
installer_root="$(cd "$(dirname "$0")" && pwd)"
exec /bin/bash "$installer_root/skills/ocr-kanban-setup/scripts/setup.sh" "$@"
