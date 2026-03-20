package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"sync"
)

// These keep imports alive while TODOs are unimplemented.
// Remove these lines once you've used binary and io in your code.
var _ = binary.BigEndian
var _ = io.EOF

const (
	opPut    byte = 0x01
	opDelete byte = 0x02
)

// WALStore is a key-value store backed by a write-ahead log.
// Writes append to the WAL file instead of rewriting the entire dataset.
type WALStore struct {
	mu      sync.Mutex
	data    map[string]string
	walPath string
	walFile *os.File
}

// NewWALStore creates a new WALStore backed by the given WAL file path.
// If the file exists, it replays the WAL to rebuild in-memory state.
func NewWALStore(walPath string) (*WALStore, error) {
	store := &WALStore{
		data:    make(map[string]string),
		walPath: walPath,
	}

	f, err := os.OpenFile(walPath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open WAL file: %w", err)
	}
	store.walFile = f

	// TODO: Call replayWAL() to rebuild in-memory state from the WAL file.
	// If replay fails, close the file and return the error.

	// Seek to end for appending new entries
	if _, err := store.walFile.Seek(0, io.SeekEnd); err != nil {
		store.walFile.Close()
		return nil, fmt.Errorf("failed to seek to end: %w", err)
	}

	return store, nil
}

// Get retrieves the value associated with the given key.
func (s *WALStore) Get(key string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// TODO: Read the value from the data map and return it.
	// Return the value and true if found, or "" and false if not.
	return "", false
}

// Put stores a key-value pair by appending a Put entry to the WAL.
func (s *WALStore) Put(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data[key] = value

	// TODO: Call appendEntry with opPut to write the WAL record,
	// then call s.walFile.Sync() to flush to disk.
	return nil
}

// Delete removes a key by appending a Delete (tombstone) entry to the WAL.
func (s *WALStore) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.data, key)

	// TODO: Call appendEntry with opDelete to write the tombstone record,
	// then call s.walFile.Sync() to flush to disk.
	return nil
}

// appendEntry writes a single WAL record in the format:
// [op:1 byte][key_len:4 bytes BigEndian][val_len:4 bytes BigEndian][key bytes][value bytes]
func (s *WALStore) appendEntry(op byte, key, value string) error {
	// TODO: Build a byte buffer containing the full record:
	//   1. op byte
	//   2. key length as 4-byte BigEndian uint32
	//   3. value length as 4-byte BigEndian uint32
	//   4. key bytes
	//   5. value bytes
	// Then write the buffer to s.walFile in a single Write call.
	// Hint: use binary.BigEndian.PutUint32() to encode lengths.
	return nil
}

// replayWAL reads the WAL file from the beginning and rebuilds the in-memory state.
func (s *WALStore) replayWAL() error {
	if _, err := s.walFile.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek error: %w", err)
	}

	for {
		// TODO: Read each WAL record in sequence:
		//   1. Read the op byte (1 byte) — if io.EOF, break (normal end)
		//   2. Read key length (4 bytes BigEndian uint32)
		//   3. Read value length (4 bytes BigEndian uint32)
		//   4. Read key bytes (keyLen bytes)
		//   5. Read value bytes (valLen bytes, skip if 0)
		//   6. Apply: if opPut, set data[key]=value. If opDelete, delete data[key].
		//
		// Use binary.Read() for fixed-size values and io.ReadFull() for byte slices.
		// For any read error other than io.EOF on the op byte, return the error.
		//
		// Stretch goal: instead of returning errors on truncated records
		// (io.ErrUnexpectedEOF), break gracefully to preserve valid entries.
		break
	}

	return nil
}

// Compact rewrites the WAL with only live entries, reclaiming space from
// deleted keys and overwritten values.
func (s *WALStore) Compact() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tmpPath := s.walPath + ".tmp"
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("create temp file error: %w", err)
	}

	// TODO: For each key-value pair in s.data, write one opPut record
	// to tmpFile using the same binary format as appendEntry:
	//   [op:1][keyLen:4][valLen:4][key][value]
	// Do NOT call appendEntry here — it writes to s.walFile, not tmpFile.
	// Use binary.BigEndian.PutUint32() and tmpFile.Write() directly.

	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("sync temp file error: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp file error: %w", err)
	}

	// Close current WAL, rename temp over it, reopen
	if err := s.walFile.Close(); err != nil {
		return fmt.Errorf("close WAL file error: %w", err)
	}
	if err := os.Rename(tmpPath, s.walPath); err != nil {
		return fmt.Errorf("rename error: %w", err)
	}
	f, err := os.OpenFile(s.walPath, os.O_RDWR|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("reopen WAL error: %w", err)
	}
	s.walFile = f

	return nil
}

// Close syncs and closes the WAL file.
func (s *WALStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.walFile.Sync(); err != nil {
		s.walFile.Close()
		return err
	}
	return s.walFile.Close()
}
