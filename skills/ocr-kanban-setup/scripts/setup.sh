#!/bin/bash
set -euo pipefail
if [ "$(uname -s)" != Darwin ]; then echo 'This installer is for macOS' >&2; exit 1; fi
bundle_root="$(cd "$(dirname "$0")/.." && pwd)"
node_version=24.22.0
case "$(uname -m)" in
  arm64) node_arch=arm64; expected_hash=6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5 ;;
  x86_64) node_arch=x64; expected_hash=495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91 ;;
  *) echo 'Unsupported Mac architecture' >&2; exit 1 ;;
esac
private_temp="$(mktemp -d "${TMPDIR:-/tmp}/ocr-kanban-setup.XXXXXXXX")"
trap 'rm -rf -- "$private_temp"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/node-v${node_version}-darwin-${node_arch}.tar.gz" -o "$private_temp/node.tar.gz"
actual_hash="$(shasum -a 256 "$private_temp/node.tar.gz" | cut -d ' ' -f 1)"
if [ "$actual_hash" != "$expected_hash" ]; then echo 'Node.js checksum mismatch' >&2; exit 1; fi
tar -xzf "$private_temp/node.tar.gz" -C "$private_temp"
"$private_temp/node-v${node_version}-darwin-${node_arch}/bin/node" "$bundle_root/scripts/wizard.mjs" --bundle "$bundle_root/assets" "$@"
