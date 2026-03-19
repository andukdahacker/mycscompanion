# Stage 1: Build the Go execution server
FROM golang:1.23-alpine AS builder

WORKDIR /build
COPY server/ .
RUN go build -o /execution-server .

# Stage 2: Runtime image with Go toolchain (needed for compiling user code)
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

# Create workspace directory for user code
RUN mkdir -p /workspace && chown runner:runner /workspace

# Copy the compiled server binary from builder stage
COPY --from=builder /execution-server /usr/local/bin/execution-server

WORKDIR /workspace
USER runner

# Pre-warm Go build cache with common stdlib packages (AC9)
# Runs as runner user so the build cache is in /home/runner/.cache/go-build
# — the same location used when compiling user code at runtime.
RUN mkdir -p /tmp/warmup \
 && echo 'module workspace' > /tmp/warmup/go.mod \
 && echo '' >> /tmp/warmup/go.mod \
 && echo 'go 1.23' >> /tmp/warmup/go.mod \
 && echo 'package main; import (_ "fmt"; _ "os"; _ "strings"; _ "strconv"; _ "sync"; _ "io"; _ "bufio"; _ "encoding/json"; _ "encoding/binary"; _ "sort"; _ "math/rand"; _ "flag"; _ "time"); func main(){}' > /tmp/warmup/main.go \
 && cd /tmp/warmup && go build -o /dev/null . && rm -rf /tmp/warmup

EXPOSE 8080
CMD ["execution-server"]
