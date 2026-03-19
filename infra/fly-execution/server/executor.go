package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf8"
)

const (
	MAX_CODE_SIZE_BYTES  = 128 * 1024      // 128KB (multi-file projects)
	MAX_OUTPUT_BYTES     = 1 * 1024 * 1024  // 1MB
	MAX_TIMEOUT_SECONDS  = 60               // Cap user-supplied timeout
	defaultTimeout       = 30 * time.Second
)

type ExecuteRequest struct {
	Code           string            `json:"code"`
	Files          map[string]string `json:"files,omitempty"`
	Args           []string          `json:"args"`
	TimeoutSeconds int               `json:"timeout_seconds"`
}

// ErrorCode identifies pre-execution errors so the HTTP handler can return
// the correct status code without fragile string matching on Stderr.
type ErrorCode string

const (
	ErrNone            ErrorCode = ""
	ErrCodeTooLarge    ErrorCode = "code_too_large"
	ErrInvalidBase64   ErrorCode = "invalid_base64"
	ErrInvalidFilename ErrorCode = "invalid_filename"
)

type ExecuteResponse struct {
	Stdout          string    `json:"stdout"`
	Stderr          string    `json:"stderr"`
	ExitCode        int       `json:"exit_code"`
	DurationMs      int64     `json:"duration_ms"`
	BuildDurationMs int64     `json:"build_duration_ms"`
	RunDurationMs   int64     `json:"run_duration_ms"`
	TimedOut        bool      `json:"timed_out"`
	Error           ErrorCode `json:"error,omitempty"`
}

func Execute(ctx context.Context, req ExecuteRequest, logger *slog.Logger, requestID string) ExecuteResponse {
	start := time.Now()

	// Determine timeout (capped to prevent resource exhaustion)
	timeout := defaultTimeout
	if req.TimeoutSeconds > 0 {
		ts := req.TimeoutSeconds
		if ts > MAX_TIMEOUT_SECONDS {
			ts = MAX_TIMEOUT_SECONDS
		}
		timeout = time.Duration(ts) * time.Second
	}

	// Create isolated tmpdir
	tmpdir, err := os.MkdirTemp("", "mcc-exec-*")
	if err != nil {
		logger.Error("failed to create tmpdir", "error", err, "request_id", requestID)
		return ExecuteResponse{
			Stderr:     "internal error: failed to create workspace",
			ExitCode:   1,
			DurationMs: time.Since(start).Milliseconds(),
		}
	}
	defer os.RemoveAll(tmpdir)

	var codeSizeBytes int

	// Multi-file path: decode and write all files
	if len(req.Files) > 0 {
		totalSize := 0
		for filename, encoded := range req.Files {
			// Filename sanitization: reject path traversal
			if strings.Contains(filename, "..") || filepath.IsAbs(filename) {
				return ExecuteResponse{
					Stderr:     fmt.Sprintf("invalid filename: %s", filename),
					ExitCode:   2,
					DurationMs: time.Since(start).Milliseconds(),
					Error:      ErrInvalidFilename,
				}
			}
			cleaned := filepath.Join(tmpdir, filename)
			if !strings.HasPrefix(filepath.Clean(cleaned), filepath.Clean(tmpdir)) {
				return ExecuteResponse{
					Stderr:     fmt.Sprintf("invalid filename: %s", filename),
					ExitCode:   2,
					DurationMs: time.Since(start).Milliseconds(),
					Error:      ErrInvalidFilename,
				}
			}

			decoded, err := base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				return ExecuteResponse{
					Stderr:     fmt.Sprintf("invalid base64 encoding for file: %s", filename),
					ExitCode:   2,
					DurationMs: time.Since(start).Milliseconds(),
					Error:      ErrInvalidBase64,
				}
			}
			totalSize += len(decoded)
			if totalSize > MAX_CODE_SIZE_BYTES {
				return ExecuteResponse{
					Stderr:     "total code size exceeds limit",
					ExitCode:   2,
					DurationMs: time.Since(start).Milliseconds(),
					Error:      ErrCodeTooLarge,
				}
			}

			// Create parent directories if needed (e.g., "pkg/util.go")
			if dir := filepath.Dir(cleaned); dir != tmpdir {
				if err := os.MkdirAll(dir, 0755); err != nil {
					logger.Error("failed to create directory", "dir", dir, "error", err, "request_id", requestID)
					return ExecuteResponse{
						Stderr:     fmt.Sprintf("internal error: failed to create directory for: %s", filename),
						ExitCode:   1,
						DurationMs: time.Since(start).Milliseconds(),
					}
				}
			}

			if err := os.WriteFile(cleaned, decoded, 0644); err != nil {
				logger.Error("failed to write file", "filename", filename, "error", err, "request_id", requestID)
				return ExecuteResponse{
					Stderr:     fmt.Sprintf("internal error: failed to write file: %s", filename),
					ExitCode:   1,
					DurationMs: time.Since(start).Milliseconds(),
				}
			}
		}

		codeSizeBytes = totalSize

		// go.mod fallback: auto-generate if not provided
		if _, hasGoMod := req.Files["go.mod"]; !hasGoMod {
			goModContent := "module workspace\n\ngo 1.23\n"
			if err := os.WriteFile(filepath.Join(tmpdir, "go.mod"), []byte(goModContent), 0644); err != nil {
				logger.Error("failed to write go.mod", "error", err, "request_id", requestID)
				return ExecuteResponse{
					Stderr:     "internal error: failed to write go.mod",
					ExitCode:   1,
					DurationMs: time.Since(start).Milliseconds(),
				}
			}
		}
	} else {
		// Single-file path (M1 backward compat)
		decoded, err := base64.StdEncoding.DecodeString(req.Code)
		if err != nil {
			return ExecuteResponse{
				Stderr:     "invalid base64 encoding",
				ExitCode:   2,
				DurationMs: time.Since(start).Milliseconds(),
				Error:      ErrInvalidBase64,
			}
		}

		codeSizeBytes = len(decoded)
		if len(decoded) > MAX_CODE_SIZE_BYTES {
			return ExecuteResponse{
				Stderr:     "code too large",
				ExitCode:   2,
				DurationMs: time.Since(start).Milliseconds(),
				Error:      ErrCodeTooLarge,
			}
		}

		// Write main.go
		if err := os.WriteFile(filepath.Join(tmpdir, "main.go"), decoded, 0644); err != nil {
			logger.Error("failed to write main.go", "error", err, "request_id", requestID)
			return ExecuteResponse{
				Stderr:     "internal error: failed to write code",
				ExitCode:   1,
				DurationMs: time.Since(start).Milliseconds(),
			}
		}

		// Write go.mod
		goModContent := "module workspace\n\ngo 1.23\n"
		if err := os.WriteFile(filepath.Join(tmpdir, "go.mod"), []byte(goModContent), 0644); err != nil {
			logger.Error("failed to write go.mod", "error", err, "request_id", requestID)
			return ExecuteResponse{
				Stderr:     "internal error: failed to write go.mod",
				ExitCode:   1,
				DurationMs: time.Since(start).Milliseconds(),
			}
		}
	}

	// BUILD PHASE
	buildStart := time.Now()
	buildCtx, buildCancel := context.WithTimeout(ctx, timeout)
	defer buildCancel()

	buildShellCmd := ulimitWrapper("go build -o main .")
	buildCmd := exec.CommandContext(buildCtx, "sh", "-c", buildShellCmd)
	buildCmd.Dir = tmpdir
	buildCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var buildStdout, buildStderr bytes.Buffer
	buildCmd.Stdout = &buildStdout
	buildCmd.Stderr = &buildStderr

	buildErr := buildCmd.Run()
	buildDuration := time.Since(buildStart).Milliseconds()

	if buildErr != nil {
		// Kill process group on context cancellation
		if buildCtx.Err() != nil && buildCmd.Process != nil {
			syscall.Kill(-buildCmd.Process.Pid, syscall.SIGKILL)
		}

		exitCode := 2 // compilation failure
		timedOut := buildCtx.Err() == context.DeadlineExceeded
		if timedOut {
			exitCode = 1
		}

		stderr := truncateOutput(buildStderr.String())

		logger.Log(ctx, levelForExit(exitCode), "execution complete",
			"request_id", requestID,
			"exit_code", exitCode,
			"duration_ms", time.Since(start).Milliseconds(),
			"code_size_bytes", codeSizeBytes,
			"phase", "build",
			"timed_out", timedOut,
		)

		return ExecuteResponse{
			Stdout:          truncateOutput(buildStdout.String()),
			Stderr:          stderr,
			ExitCode:        exitCode,
			DurationMs:      time.Since(start).Milliseconds(),
			BuildDurationMs: buildDuration,
			RunDurationMs:   0,
			TimedOut:        timedOut,
		}
	}

	// RUN PHASE
	runStart := time.Now()
	// Use remaining timeout for run phase
	remainingTimeout := timeout - time.Since(buildStart)
	if remainingTimeout <= 0 {
		remainingTimeout = time.Second
	}
	runCtx, runCancel := context.WithTimeout(ctx, remainingTimeout)
	defer runCancel()

	shellCmd := ulimitWrapper("./main")
	if len(req.Args) > 0 {
		for _, arg := range req.Args {
			shellCmd += " " + shellescape(arg)
		}
	}

	runCmd := exec.CommandContext(runCtx, "sh", "-c", shellCmd)
	runCmd.Dir = tmpdir
	runCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var runStdout, runStderr bytes.Buffer
	runCmd.Stdout = &runStdout
	runCmd.Stderr = &runStderr

	runErr := runCmd.Run()
	runDuration := time.Since(runStart).Milliseconds()

	// Kill process group on context cancellation
	if runCtx.Err() != nil && runCmd.Process != nil {
		syscall.Kill(-runCmd.Process.Pid, syscall.SIGKILL)
	}

	exitCode := 0
	timedOut := runCtx.Err() == context.DeadlineExceeded
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	stdout := truncateOutput(runStdout.String())
	stderr := truncateOutput(runStderr.String())

	totalDuration := time.Since(start).Milliseconds()

	logger.Log(ctx, levelForExit(exitCode), "execution complete",
		"request_id", requestID,
		"exit_code", exitCode,
		"duration_ms", totalDuration,
		"build_duration_ms", buildDuration,
		"run_duration_ms", runDuration,
		"code_size_bytes", codeSizeBytes,
		"timed_out", timedOut,
	)

	return ExecuteResponse{
		Stdout:          stdout,
		Stderr:          stderr,
		ExitCode:        exitCode,
		DurationMs:      totalDuration,
		BuildDurationMs: buildDuration,
		RunDurationMs:   runDuration,
		TimedOut:        timedOut,
	}
}

func truncateOutput(s string) string {
	if len(s) > MAX_OUTPUT_BYTES {
		// Walk backward to avoid splitting a multi-byte UTF-8 character
		truncated := s[:MAX_OUTPUT_BYTES]
		for !utf8.ValidString(truncated) {
			truncated = truncated[:len(truncated)-1]
		}
		return truncated + "\n[output truncated]"
	}
	return s
}

func shellescape(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

// ulimitWrapper wraps a command with ulimit -u 256 for fork bomb prevention.
// In Docker (production), ulimit is always applied. Locally, set MCC_DISABLE_ULIMIT=1
// to skip (macOS ulimit behavior differs from Linux).
func ulimitWrapper(cmd string) string {
	if os.Getenv("MCC_DISABLE_ULIMIT") == "1" {
		return cmd
	}
	return "ulimit -u 256 && " + cmd
}

func levelForExit(exitCode int) slog.Level {
	if exitCode == 0 {
		return slog.LevelInfo
	}
	return slog.LevelWarn
}

var requestCounter uint64

func generateRequestID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), atomic.AddUint64(&requestCounter, 1))
}
