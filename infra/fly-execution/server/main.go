package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

// NewHandler creates the HTTP handler with all routes wired up.
// Used by main() and tests to ensure tests validate the real code path.
func NewHandler(secret string, maxConcurrent int, logger *slog.Logger) http.Handler {
	sem := make(chan struct{}, maxConcurrent)
	mux := http.NewServeMux()

	// Health endpoint — unauthenticated (AC4)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Execute endpoint — authenticated (AC2, AC5)
	mux.HandleFunc("POST /execute", func(w http.ResponseWriter, r *http.Request) {
		// Auth middleware (AC5)
		token := extractBearerToken(r)
		if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(secret)) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Semaphore acquire — non-blocking (AC6)
		select {
		case sem <- struct{}{}:
			defer func() { <-sem }()
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"error": "service busy"})
			return
		}

		// Parse request
		var req ExecuteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if req.Code == "" && len(req.Files) == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "code or files is required"})
			return
		}

		requestID := generateRequestID()
		resp := Execute(r.Context(), req, logger, requestID)

		// Pre-execution errors return 400 (AC6a) — uses typed ErrorCode, not string matching
		if resp.Error == ErrCodeTooLarge {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "code too large"})
			return
		}
		if resp.Error == ErrInvalidBase64 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid base64 encoding"})
			return
		}
		if resp.Error == ErrInvalidFilename {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid filename"})
			return
		}

		// Always 200 for execution results (AC2)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	})

	return mux
}

func main() {
	// Structured JSON logging (matches backend pino convention)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// Read configuration from environment
	secret := os.Getenv("MCC_EXECUTION_SECRET")
	if secret == "" {
		logger.Error("MCC_EXECUTION_SECRET is required")
		os.Exit(1)
	}

	maxConcurrent := 10
	if val := os.Getenv("MCC_MAX_CONCURRENT"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil || parsed < 1 {
			logger.Error("MCC_MAX_CONCURRENT must be a positive integer", "value", val)
			os.Exit(1)
		}
		maxConcurrent = parsed
	}

	handler := NewHandler(secret, maxConcurrent, logger)

	server := &http.Server{
		Addr:    ":8080",
		Handler: handler,
	}

	// Graceful shutdown (AC13)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		logger.Info("server starting", "addr", ":8080", "max_concurrent", maxConcurrent)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received, draining connections")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}

	logger.Info("server stopped")
}

func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}
	return ""
}

