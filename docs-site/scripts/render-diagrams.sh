#!/usr/bin/env bash
# render-diagrams.sh — renders every .puml in src/diagrams/ to static/ as SVG
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIAGRAMS_DIR="$SCRIPT_DIR/../src/diagrams"
OUTPUT_DIR="$SCRIPT_DIR/../static"

mapfile -t puml_files < <(find "$DIAGRAMS_DIR" -maxdepth 1 -name '*.puml' | sort)

if [[ ${#puml_files[@]} -eq 0 ]]; then
  echo "render-diagrams: no .puml files found"
  exit 0
fi

echo "render-diagrams: rendering ${#puml_files[@]} diagram(s) to $OUTPUT_DIR"
plantuml -tsvg "${puml_files[@]}" -o "$OUTPUT_DIR"
