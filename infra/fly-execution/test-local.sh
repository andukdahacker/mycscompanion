#!/usr/bin/env bash
set -euo pipefail

IMAGE="mcc-execution:local"

echo "==> Building execution image..."
docker build -t "$IMAGE" "$(dirname "$0")"

echo "==> Verifying Go version..."
docker run --rm "$IMAGE" go version

echo "==> Verifying no network utilities..."
docker run --rm --entrypoint sh "$IMAGE" -c '! command -v curl && ! command -v wget && ! command -v git && ! command -v ssh'

echo "==> Compiling hello-world program..."
docker run --rm "$IMAGE" sh -c '
  cat > /workspace/main.go <<EOF
package main

import "fmt"

func main() {
	fmt.Println("Hello from execution environment")
}
EOF
  go build -o /workspace/hello /workspace/main.go
  /workspace/hello
'

echo "==> All checks passed."
