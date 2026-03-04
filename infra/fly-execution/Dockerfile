# Execution environment for compiling and running learner Go code.
# Single-stage image — the image IS the Go toolchain.
# Security constraints (network, pids-limit, read-only) are enforced
# at Fly Machine creation time (Story 3.2), not here.

FROM golang:1.23-alpine

# Remove unnecessary packages and network utilities.
# Alpine base has very little, but ensure nothing sneaks in.
# wget is a busybox applet — remove the symlink explicitly.
RUN apk --no-cache upgrade \
 && rm -f /usr/bin/wget \
 && rm -rf /var/cache/apk/* /usr/share/doc /usr/share/man /tmp/*

# Verify no network utilities are present
RUN ! command -v curl && ! command -v wget && ! command -v git && ! command -v ssh

# Create non-root runner user for code execution
RUN adduser -D -h /home/runner runner

# Create workspace directory for user code injection.
# Must be writable — benchmarks run user then reference implementation
# sequentially on the same Machine.
RUN mkdir -p /workspace && chown runner:runner /workspace

WORKDIR /workspace
USER runner
