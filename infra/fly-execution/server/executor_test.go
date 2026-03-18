package main

import (
	"context"
	"encoding/base64"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestExecute_SuccessfulCompilationAndExecution(t *testing.T) {
	code := `package main

import "fmt"

func main() {
	fmt.Println("hello world")
}
`
	req := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code)),
		TimeoutSeconds: 30,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-1")

	if resp.ExitCode != 0 {
		t.Fatalf("expected exit_code 0, got %d. stderr: %s", resp.ExitCode, resp.Stderr)
	}
	if strings.TrimSpace(resp.Stdout) != "hello world" {
		t.Fatalf("expected stdout 'hello world', got %q", resp.Stdout)
	}
	if resp.BuildDurationMs <= 0 {
		t.Fatal("expected positive build_duration_ms")
	}
	if resp.RunDurationMs <= 0 {
		t.Fatal("expected positive run_duration_ms")
	}
	if resp.DurationMs <= 0 {
		t.Fatal("expected positive duration_ms")
	}
	if resp.TimedOut {
		t.Fatal("expected timed_out false for successful execution")
	}
}

func TestExecute_CompilationError(t *testing.T) {
	code := `package main

func main() {
	undefined_function()
}
`
	req := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code)),
		TimeoutSeconds: 30,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-2")

	if resp.ExitCode != 2 {
		t.Fatalf("expected exit_code 2 for compilation failure, got %d", resp.ExitCode)
	}
	if !strings.Contains(resp.Stderr, "undefined") {
		t.Fatalf("expected stderr to contain 'undefined', got %q", resp.Stderr)
	}
	if resp.BuildDurationMs <= 0 {
		t.Fatal("expected positive build_duration_ms")
	}
	if resp.RunDurationMs != 0 {
		t.Fatalf("expected run_duration_ms 0, got %d", resp.RunDurationMs)
	}
	if resp.TimedOut {
		t.Fatal("expected timed_out false for compilation error")
	}
}

func TestExecute_RuntimeTimeout(t *testing.T) {
	// Use time.Sleep for a long block — select{} causes deadlock panic and exits immediately
	code := `package main

import "time"

func main() {
	time.Sleep(60 * time.Second)
}
`
	req := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code)),
		TimeoutSeconds: 3,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-3")

	if resp.ExitCode == 0 {
		t.Fatal("expected non-zero exit_code for timeout")
	}
	// Total timeout is 3s shared between build and run.
	// Build takes ~0.5s, so run should timeout after ~2.5s remaining.
	if resp.DurationMs < 2000 {
		t.Fatalf("expected duration >= 2000ms for 3s timeout, got %d", resp.DurationMs)
	}
	if !resp.TimedOut {
		t.Fatal("expected timed_out true for timeout")
	}
}

func TestExecute_ConcurrentRequestIsolation(t *testing.T) {
	code1 := `package main

import "fmt"

func main() {
	fmt.Println("output-from-request-1")
}
`
	code2 := `package main

import "fmt"

func main() {
	fmt.Println("output-from-request-2")
}
`
	req1 := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code1)),
		TimeoutSeconds: 30,
	}
	req2 := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code2)),
		TimeoutSeconds: 30,
	}

	var resp1, resp2 ExecuteResponse
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		resp1 = Execute(context.Background(), req1, testLogger(), "test-4a")
	}()
	go func() {
		defer wg.Done()
		resp2 = Execute(context.Background(), req2, testLogger(), "test-4b")
	}()
	wg.Wait()

	if resp1.ExitCode != 0 {
		t.Fatalf("request 1: expected exit_code 0, got %d. stderr: %s", resp1.ExitCode, resp1.Stderr)
	}
	if resp2.ExitCode != 0 {
		t.Fatalf("request 2: expected exit_code 0, got %d. stderr: %s", resp2.ExitCode, resp2.Stderr)
	}
	if strings.TrimSpace(resp1.Stdout) != "output-from-request-1" {
		t.Fatalf("request 1: output leaked, got %q", resp1.Stdout)
	}
	if strings.TrimSpace(resp2.Stdout) != "output-from-request-2" {
		t.Fatalf("request 2: output leaked, got %q", resp2.Stdout)
	}
}

func TestExecute_CodeSizeLimitRejection(t *testing.T) {
	// Create code larger than 64KB
	bigCode := "package main\n\nfunc main() {}\n" + strings.Repeat("// padding\n", 7000)
	if len(bigCode) <= MAX_CODE_SIZE_BYTES {
		t.Fatal("test setup: code should exceed MAX_CODE_SIZE_BYTES")
	}

	req := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(bigCode)),
		TimeoutSeconds: 30,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-5")

	if resp.Stderr != "code too large" {
		t.Fatalf("expected stderr 'code too large', got %q", resp.Stderr)
	}
	if resp.ExitCode != 2 {
		t.Fatalf("expected exit_code 2, got %d", resp.ExitCode)
	}
}

func TestExecute_OutputTruncation(t *testing.T) {
	// Program that prints > 1MB to stdout
	code := `package main

import (
	"fmt"
	"strings"
)

func main() {
	// Print ~1.5MB of output
	line := strings.Repeat("x", 1000) + "\n"
	for i := 0; i < 1600; i++ {
		fmt.Print(line)
	}
}
`
	req := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code)),
		TimeoutSeconds: 30,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-6")

	if resp.ExitCode != 0 {
		t.Fatalf("expected exit_code 0, got %d. stderr: %s", resp.ExitCode, resp.Stderr)
	}
	if !strings.HasSuffix(resp.Stdout, "\n[output truncated]") {
		t.Fatal("expected stdout to end with '\\n[output truncated]'")
	}
	// Should be roughly MAX_OUTPUT_BYTES + len("\n[output truncated]")
	if len(resp.Stdout) > MAX_OUTPUT_BYTES+100 {
		t.Fatalf("stdout too large after truncation: %d bytes", len(resp.Stdout))
	}
}

func TestExecute_WithArgs(t *testing.T) {
	code := `package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println(os.Args[1])
}
`
	req := ExecuteRequest{
		Code:           base64.StdEncoding.EncodeToString([]byte(code)),
		Args:           []string{"test-arg"},
		TimeoutSeconds: 30,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-7")

	if resp.ExitCode != 0 {
		t.Fatalf("expected exit_code 0, got %d. stderr: %s", resp.ExitCode, resp.Stderr)
	}
	if strings.TrimSpace(resp.Stdout) != "test-arg" {
		t.Fatalf("expected stdout 'test-arg', got %q", resp.Stdout)
	}
}

func TestExecute_InvalidBase64(t *testing.T) {
	req := ExecuteRequest{
		Code:           "not-valid-base64!!!",
		TimeoutSeconds: 30,
	}

	resp := Execute(context.Background(), req, testLogger(), "test-8")

	if resp.Stderr != "invalid base64 encoding" {
		t.Fatalf("expected stderr 'invalid base64 encoding', got %q", resp.Stderr)
	}
}
