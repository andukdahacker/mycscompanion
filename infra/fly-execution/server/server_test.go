package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

const testSecret = "test-secret-token"

func newTestServer(maxConcurrent int) http.Handler {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	return NewHandler(testSecret, maxConcurrent, logger)
}

func TestHealth_Returns200(t *testing.T) {
	server := newTestServer(10)
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	server.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %q", resp["status"])
	}
}

func TestAuth_MissingToken(t *testing.T) {
	server := newTestServer(10)

	body := map[string]interface{}{
		"code":            base64.StdEncoding.EncodeToString([]byte(`package main; func main(){}`)),
		"timeout_seconds": 30,
	}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/execute", bytes.NewReader(jsonBody))

	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "unauthorized" {
		t.Fatalf("expected error 'unauthorized', got %q", resp["error"])
	}
}

func TestAuth_WrongToken(t *testing.T) {
	server := newTestServer(10)

	body := map[string]interface{}{
		"code":            base64.StdEncoding.EncodeToString([]byte(`package main; func main(){}`)),
		"timeout_seconds": 30,
	}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/execute", bytes.NewReader(jsonBody))
	req.Header.Set("Authorization", "Bearer wrong-token")

	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestAuth_ValidToken(t *testing.T) {
	server := newTestServer(10)

	code := `package main

import "fmt"

func main() {
	fmt.Println("ok")
}
`
	body := map[string]interface{}{
		"code":            base64.StdEncoding.EncodeToString([]byte(code)),
		"timeout_seconds": 30,
	}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/execute", bytes.NewReader(jsonBody))
	req.Header.Set("Authorization", "Bearer "+testSecret)

	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body: %s", w.Code, w.Body.String())
	}

	var resp ExecuteResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.ExitCode != 0 {
		t.Fatalf("expected exit_code 0, got %d. stderr: %s", resp.ExitCode, resp.Stderr)
	}
	if strings.TrimSpace(resp.Stdout) != "ok" {
		t.Fatalf("expected stdout 'ok', got %q", resp.Stdout)
	}
}

func TestSemaphore_Exhaustion(t *testing.T) {
	// Create server with semaphore of 1
	server := newTestServer(1)

	// Fill the semaphore with a long-running request
	longCode := `package main

import "time"

func main() {
	time.Sleep(5 * time.Second)
}
`
	body1 := map[string]interface{}{
		"code":            base64.StdEncoding.EncodeToString([]byte(longCode)),
		"timeout_seconds": 10,
	}
	jsonBody1, _ := json.Marshal(body1)

	// Start long request in background
	done := make(chan struct{})
	go func() {
		defer close(done)
		req := httptest.NewRequest("POST", "/execute", bytes.NewReader(jsonBody1))
		req.Header.Set("Authorization", "Bearer "+testSecret)
		w := httptest.NewRecorder()
		server.ServeHTTP(w, req)
	}()

	// Give the first request time to acquire the semaphore
	time.Sleep(500 * time.Millisecond)

	// Try a second request — should get 503
	body2 := map[string]interface{}{
		"code":            base64.StdEncoding.EncodeToString([]byte(`package main; func main(){}`)),
		"timeout_seconds": 30,
	}
	jsonBody2, _ := json.Marshal(body2)
	req2 := httptest.NewRequest("POST", "/execute", bytes.NewReader(jsonBody2))
	req2.Header.Set("Authorization", "Bearer "+testSecret)

	w2 := httptest.NewRecorder()
	server.ServeHTTP(w2, req2)

	if w2.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w2.Code)
	}

	var resp map[string]string
	json.NewDecoder(w2.Body).Decode(&resp)
	if resp["error"] != "service busy" {
		t.Fatalf("expected error 'service busy', got %q", resp["error"])
	}

	// Wait for background request to finish
	<-done
}
