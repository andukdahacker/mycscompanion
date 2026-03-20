package main

import (
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strings"
	"time"
)

func runTests() {
	// --- Test 1: kv-baseline ---
	fmt.Println("=== kv-baseline ===")
	func() {
		dataFile := "test_kv_baseline.db"
		defer os.Remove(dataFile)

		store, err := NewKVStore(dataFile)
		if err != nil {
			fmt.Printf("FAIL: kv-baseline — could not create KVStore: %v\n", err)
			return
		}
		defer store.Close()

		if err := store.Put("name", "mycscompanion"); err != nil {
			fmt.Printf("FAIL: kv-baseline — put error: %v\n", err)
			return
		}
		if val, ok := store.Get("name"); !ok || val != "mycscompanion" {
			fmt.Printf("FAIL: kv-baseline — expected 'mycscompanion', got '%s' (found=%v)\n", val, ok)
			return
		}
		if err := store.Delete("name"); err != nil {
			fmt.Printf("FAIL: kv-baseline — delete error: %v\n", err)
			return
		}
		if _, ok := store.Get("name"); ok {
			fmt.Println("FAIL: kv-baseline — key still exists after delete")
			return
		}
		fmt.Println("PASS: kv-baseline")
	}()

	// --- Test 2: wal-append ---
	fmt.Println("=== wal-append ===")
	func() {
		walFile := "test_wal_append.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: wal-append — could not create WALStore: %v\n", err)
			return
		}
		defer store.Close()

		if err := store.Put("greeting", "hello"); err != nil {
			fmt.Printf("FAIL: wal-append — put error: %v\n", err)
			return
		}
		if val, ok := store.Get("greeting"); !ok || val != "hello" {
			fmt.Printf("FAIL: wal-append — expected 'hello', got '%s' (found=%v)\n", val, ok)
			return
		}
		fmt.Println("PASS: wal-append")
	}()

	// --- Test 3: wal-format ---
	fmt.Println("=== wal-format ===")
	func() {
		walFile := "test_wal_format.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: wal-format — could not create WALStore: %v\n", err)
			return
		}
		if err := store.Put("hi", "there"); err != nil {
			fmt.Printf("FAIL: wal-format — put error: %v\n", err)
			store.Close()
			return
		}
		store.Close()

		// Read raw WAL file bytes and verify format:
		// [op:1][keyLen:4][valLen:4][key][value]
		raw, err := os.ReadFile(walFile)
		if err != nil {
			fmt.Printf("FAIL: wal-format — could not read WAL file: %v\n", err)
			return
		}

		// Expected: 1 + 4 + 4 + 2 + 5 = 16 bytes
		if len(raw) != 16 {
			fmt.Printf("FAIL: wal-format — expected 16 bytes, got %d\n", len(raw))
			return
		}

		if raw[0] != 0x01 {
			fmt.Printf("FAIL: wal-format — byte 0 should be 0x01 (opPut), got 0x%02x\n", raw[0])
			return
		}

		keyLen := binary.BigEndian.Uint32(raw[1:5])
		if keyLen != 2 {
			fmt.Printf("FAIL: wal-format — key length should be 2, got %d\n", keyLen)
			return
		}

		valLen := binary.BigEndian.Uint32(raw[5:9])
		if valLen != 5 {
			fmt.Printf("FAIL: wal-format — value length should be 5, got %d\n", valLen)
			return
		}

		key := string(raw[9:11])
		if key != "hi" {
			fmt.Printf("FAIL: wal-format — key should be 'hi', got '%s'\n", key)
			return
		}

		value := string(raw[11:16])
		if value != "there" {
			fmt.Printf("FAIL: wal-format — value should be 'there', got '%s'\n", value)
			return
		}

		fmt.Println("PASS: wal-format")
	}()

	// --- Test 4: delete-via-wal ---
	fmt.Println("=== delete-via-wal ===")
	func() {
		walFile := "test_delete_via_wal.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: delete-via-wal — could not create WALStore: %v\n", err)
			return
		}
		defer store.Close()

		if err := store.Put("temp", "value"); err != nil {
			fmt.Printf("FAIL: delete-via-wal — put error: %v\n", err)
			return
		}
		if err := store.Delete("temp"); err != nil {
			fmt.Printf("FAIL: delete-via-wal — delete error: %v\n", err)
			return
		}
		if _, ok := store.Get("temp"); ok {
			fmt.Println("FAIL: delete-via-wal — key still exists after delete")
			return
		}
		fmt.Println("PASS: delete-via-wal")
	}()

	// --- Test 5: crash-recovery ---
	fmt.Println("=== crash-recovery ===")
	func() {
		walFile := "test_crash_recovery.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: crash-recovery — could not create WALStore: %v\n", err)
			return
		}

		store.Put("key1", "val1")
		store.Put("key2", "val2")
		store.Put("key3", "val3")
		// Intentionally do NOT call Close() — simulate unclean shutdown.
		// The leaked fd is harmless: on Unix, two fds to the same file is legal.
		// Data survives because Put calls walFile.Sync() after every append.

		// Open a new store on the same file — should recover via replay
		store2, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: crash-recovery — could not reopen WALStore: %v\n", err)
			return
		}
		defer store2.Close()

		allOk := true
		for _, tc := range []struct{ key, val string }{
			{"key1", "val1"}, {"key2", "val2"}, {"key3", "val3"},
		} {
			if v, ok := store2.Get(tc.key); !ok || v != tc.val {
				fmt.Printf("FAIL: crash-recovery — expected %s=%s, got '%s' (found=%v)\n", tc.key, tc.val, v, ok)
				allOk = false
			}
		}
		if allOk {
			fmt.Println("PASS: crash-recovery")
		}
	}()

	// --- Test 6: replay-ordering ---
	fmt.Println("=== replay-ordering ===")
	func() {
		walFile := "test_replay_ordering.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: replay-ordering — could not create WALStore: %v\n", err)
			return
		}

		store.Put("x", "first")
		store.Put("x", "second")
		store.Delete("x")
		store.Put("x", "third")
		store.Close()

		store2, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: replay-ordering — could not reopen WALStore: %v\n", err)
			return
		}
		defer store2.Close()

		if val, ok := store2.Get("x"); !ok || val != "third" {
			fmt.Printf("FAIL: replay-ordering — expected 'third', got '%s' (found=%v)\n", val, ok)
			return
		}
		fmt.Println("PASS: replay-ordering")
	}()

	// --- Test 7: compaction ---
	fmt.Println("=== compaction ===")
	func() {
		walFile := "test_compaction.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: compaction — could not create WALStore: %v\n", err)
			return
		}

		store.Put("A", "1")
		store.Put("B", "2")
		store.Put("C", "3")
		store.Put("D", "4")
		store.Put("E", "5")
		store.Delete("B")
		store.Delete("D")

		if err := store.Compact(); err != nil {
			fmt.Printf("FAIL: compaction — compact error: %v\n", err)
			store.Close()
			return
		}
		store.Close()

		// Reopen and verify
		store2, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: compaction — could not reopen after compact: %v\n", err)
			return
		}

		for _, key := range []string{"A", "C", "E"} {
			if _, ok := store2.Get(key); !ok {
				fmt.Printf("FAIL: compaction — key %s missing after compact+reopen\n", key)
				store2.Close()
				return
			}
		}
		for _, key := range []string{"B", "D"} {
			if _, ok := store2.Get(key); ok {
				fmt.Printf("FAIL: compaction — deleted key %s still present after compact+reopen\n", key)
				store2.Close()
				return
			}
		}

		// Write new key after compaction, reopen again
		store2.Put("F", "6")
		store2.Close()

		store3, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: compaction — could not reopen after post-compact write: %v\n", err)
			return
		}
		defer store3.Close()

		for _, tc := range []struct{ key, val string }{
			{"A", "1"}, {"C", "3"}, {"E", "5"}, {"F", "6"},
		} {
			if v, ok := store3.Get(tc.key); !ok || v != tc.val {
				fmt.Printf("FAIL: compaction — expected %s=%s, got '%s' (found=%v)\n", tc.key, tc.val, v, ok)
				return
			}
		}
		for _, key := range []string{"B", "D"} {
			if _, ok := store3.Get(key); ok {
				fmt.Printf("FAIL: compaction — deleted key %s still present after second reopen\n", key)
				return
			}
		}

		fmt.Println("PASS: compaction")
	}()

	// --- Test 8: post-compaction-reads ---
	fmt.Println("=== post-compaction-reads ===")
	func() {
		walFile := "test_post_compaction_reads.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: post-compaction-reads — could not create WALStore: %v\n", err)
			return
		}

		// Put 100 keys
		for i := 0; i < 100; i++ {
			store.Put(fmt.Sprintf("key-%d", i), fmt.Sprintf("value-%d", i))
		}
		// Delete even-numbered keys
		for i := 0; i < 100; i += 2 {
			store.Delete(fmt.Sprintf("key-%d", i))
		}

		if err := store.Compact(); err != nil {
			fmt.Printf("FAIL: post-compaction-reads — compact error: %v\n", err)
			store.Close()
			return
		}
		store.Close()

		store2, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: post-compaction-reads — could not reopen: %v\n", err)
			return
		}
		defer store2.Close()

		allOk := true
		// Odd keys should be present
		for i := 1; i < 100; i += 2 {
			key := fmt.Sprintf("key-%d", i)
			expected := fmt.Sprintf("value-%d", i)
			if v, ok := store2.Get(key); !ok || v != expected {
				fmt.Printf("FAIL: post-compaction-reads — expected %s=%s, got '%s' (found=%v)\n", key, expected, v, ok)
				allOk = false
				break
			}
		}
		// Even keys should be absent
		if allOk {
			for i := 0; i < 100; i += 2 {
				key := fmt.Sprintf("key-%d", i)
				if _, ok := store2.Get(key); ok {
					fmt.Printf("FAIL: post-compaction-reads — deleted key %s still present\n", key)
					allOk = false
					break
				}
			}
		}
		if allOk {
			fmt.Println("PASS: post-compaction-reads")
		}
	}()

	// --- Test 9: performance-improvement ---
	fmt.Println("=== performance-improvement ===")
	func() {
		walFile := "test_performance.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: performance-improvement — could not create WALStore: %v\n", err)
			return
		}
		defer store.Close()

		numOps := 1000
		start := time.Now()
		for i := 0; i < numOps; i++ {
			store.Put(fmt.Sprintf("perf-key-%d", i), fmt.Sprintf("perf-value-%d", i))
		}
		elapsed := time.Since(start)
		opsPerSec := float64(numOps) / elapsed.Seconds()

		if opsPerSec < 300 {
			fmt.Printf("FAIL: performance-improvement — %.0f ops/sec (need >300)\n", opsPerSec)
			return
		}
		fmt.Println("PASS: performance-improvement")
	}()

	// --- Test 10: exit-clean ---
	// The platform evaluates this via exit code, not stdout.
	// Print PASS here so learners see consistent output for all criteria.
	fmt.Println("=== exit-clean ===")
	fmt.Println("PASS: exit-clean")

	// --- Test 11: partial-write-safety (stretch) ---
	fmt.Println("=== partial-write-safety ===")
	func() {
		walFile := "test_partial_write.db"
		defer os.Remove(walFile)

		store, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: partial-write-safety — could not create WALStore: %v\n", err)
			return
		}

		store.Put("pw1", "val1")
		store.Put("pw2", "val2")
		store.Put("pw3", "val3")
		store.Close()

		// Append 3 garbage bytes to simulate a crash mid-write
		f, err := os.OpenFile(walFile, os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			fmt.Printf("FAIL: partial-write-safety — could not open for append: %v\n", err)
			return
		}
		f.Write([]byte{0xFF, 0xAB, 0xCD})
		f.Close()

		// Reopen — should recover the 3 valid entries gracefully
		store2, err := NewWALStore(walFile)
		if err != nil {
			fmt.Printf("FAIL: partial-write-safety — NewWALStore returned error: %v\n", err)
			return
		}
		defer store2.Close()

		allOk := true
		for _, tc := range []struct{ key, val string }{
			{"pw1", "val1"}, {"pw2", "val2"}, {"pw3", "val3"},
		} {
			if v, ok := store2.Get(tc.key); !ok || v != tc.val {
				fmt.Printf("FAIL: partial-write-safety — expected %s=%s, got '%s' (found=%v)\n", tc.key, tc.val, v, ok)
				allOk = false
			}
		}
		if allOk {
			fmt.Println("PASS: partial-write-safety")
		}
	}()

	fmt.Println("=== done ===")
}

func runBenchmark() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: <binary> benchmark <benchmark-name>")
		fmt.Fprintln(os.Stderr, "  sequential-inserts-wal")
		fmt.Fprintln(os.Stderr, "  crash-recovery-replay")
		os.Exit(1)
	}

	benchName := os.Args[2]

	switch benchName {
	case "sequential-inserts-wal":
		runBenchmarkInserts()
	case "crash-recovery-replay":
		runBenchmarkReplay()
	default:
		fmt.Fprintf(os.Stderr, "Unknown benchmark: %s\n", benchName)
		os.Exit(1)
	}
}

func runBenchmarkInserts() {
	benchFlags := flag.NewFlagSet("benchmark", flag.ExitOnError)
	numOps := benchFlags.Int("ops", 1000, "number of operations")
	keySize := benchFlags.Int("key-size", 16, "key size in bytes")
	valueSize := benchFlags.Int("value-size", 64, "value size in bytes")
	benchFlags.Parse(os.Args[3:])

	walFile := "bench_inserts.db"
	defer os.Remove(walFile)

	// Pre-generate keys and values
	keys := make([]string, *numOps)
	values := make([]string, *numOps)
	for i := 0; i < *numOps; i++ {
		keys[i] = randomString(*keySize)
		values[i] = randomString(*valueSize)
	}

	store, err := NewWALStore(walFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create WALStore: %v\n", err)
		os.Exit(1)
	}

	latencies := make([]float64, *numOps)
	for i := 0; i < *numOps; i++ {
		start := time.Now()
		store.Put(keys[i], values[i])
		latencies[i] = float64(time.Since(start).Microseconds())
	}
	store.Close()

	sort.Float64s(latencies)
	var totalUs float64
	for _, l := range latencies {
		totalUs += l
	}
	opsPerSec := float64(*numOps) / (totalUs / 1e6)
	p50 := percentileFloat(latencies, 50)
	p99 := percentileFloat(latencies, 99)

	result := map[string]interface{}{
		"type":           "benchmark_iteration",
		"target":         "self",
		"iteration":      1,
		"total":          1,
		"ops_per_sec":    math.Round(opsPerSec*100) / 100,
		"p50_latency_us": math.Round(p50*100) / 100,
		"p99_latency_us": math.Round(p99*100) / 100,
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func runBenchmarkReplay() {
	walFile := "bench_replay.db"
	defer os.Remove(walFile)

	numEntries := 50000
	keySize := 16
	valueSize := 64

	// Pre-write entries directly to WAL file (bypass Put/fsync for fast setup)
	f, err := os.Create(walFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create WAL file for setup: %v\n", err)
		os.Exit(1)
	}
	for i := 0; i < numEntries; i++ {
		key := randomString(keySize)
		value := randomString(valueSize)
		buf := make([]byte, 1+4+4+len(key)+len(value))
		buf[0] = 0x01 // opPut
		binary.BigEndian.PutUint32(buf[1:5], uint32(len(key)))
		binary.BigEndian.PutUint32(buf[5:9], uint32(len(value)))
		copy(buf[9:], key)
		copy(buf[9+len(key):], value)
		f.Write(buf)
	}
	f.Sync()
	f.Close()

	// Time replay iterations
	iterations := 5
	speeds := make([]float64, iterations)
	for i := 0; i < iterations; i++ {
		// Copy WAL to fresh path for each iteration
		iterFile := fmt.Sprintf("bench_replay_iter_%d.db", i)
		copyFile(walFile, iterFile)

		start := time.Now()
		s, err := NewWALStore(iterFile)
		elapsed := time.Since(start)

		if err != nil {
			fmt.Fprintf(os.Stderr, "replay iteration %d failed: %v\n", i, err)
			os.Remove(iterFile)
			os.Exit(1)
		}
		s.Close()
		os.Remove(iterFile)

		entriesPerSec := float64(numEntries) / elapsed.Seconds()
		speeds[i] = entriesPerSec
	}

	sort.Float64s(speeds)
	medianOpsPerSec := speeds[len(speeds)/2]

	result := map[string]interface{}{
		"type":           "benchmark_iteration",
		"target":         "self",
		"iteration":      1,
		"total":          1,
		"ops_per_sec":    math.Round(medianOpsPerSec*100) / 100,
		"p50_latency_us": 0,
		"p99_latency_us": 0,
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func copyFile(src, dst string) {
	data, err := os.ReadFile(src)
	if err != nil {
		fmt.Fprintf(os.Stderr, "copy error reading %s: %v\n", src, err)
		os.Exit(1)
	}
	if err := os.WriteFile(dst, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "copy error writing %s: %v\n", dst, err)
		os.Exit(1)
	}
}

func percentileFloat(sorted []float64, pct int) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := float64(pct) / 100.0 * float64(len(sorted)-1)
	lower := int(idx)
	upper := lower + 1
	if upper >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := idx - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

func randomString(n int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteByte(charset[rand.Intn(len(charset))])
	}
	return b.String()
}
