package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"sync"
)

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

	// Note: O_RDWR (not O_APPEND) because we need to read for replay first,
	// then seek to end for appending. O_APPEND would also work but the
	// explicit seek makes the read-then-write flow clearer.
	f, err := os.OpenFile(walPath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open WAL file: %w", err)
	}
	store.walFile = f

	if err := store.replayWAL(); err != nil {
		store.walFile.Close()
		return nil, fmt.Errorf("failed to replay WAL: %w", err)
	}

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

	val, ok := s.data[key]
	return val, ok
}

// Put stores a key-value pair by appending a Put entry to the WAL.
func (s *WALStore) Put(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data[key] = value
	if err := s.appendEntry(opPut, key, value); err != nil {
		return err
	}
	return s.walFile.Sync()
}

// Delete removes a key by appending a Delete (tombstone) entry to the WAL.
func (s *WALStore) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.data, key)
	if err := s.appendEntry(opDelete, key, ""); err != nil {
		return err
	}
	return s.walFile.Sync()
}

// appendEntry writes a single WAL record in the format:
// [op:1 byte][key_len:4 bytes BigEndian][val_len:4 bytes BigEndian][key bytes][value bytes]
func (s *WALStore) appendEntry(op byte, key, value string) error {
	// Buffer the entire record into a single write to minimize syscalls
	buf := make([]byte, 1+4+4+len(key)+len(value))
	buf[0] = op
	binary.BigEndian.PutUint32(buf[1:5], uint32(len(key)))
	binary.BigEndian.PutUint32(buf[5:9], uint32(len(value)))
	copy(buf[9:], key)
	copy(buf[9+len(key):], value)

	if _, err := s.walFile.Write(buf); err != nil {
		return fmt.Errorf("write WAL entry error: %w", err)
	}
	return nil
}

// replayWAL reads the WAL file from the beginning and rebuilds the in-memory state.
func (s *WALStore) replayWAL() error {
	if _, err := s.walFile.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek error: %w", err)
	}

	for {
		// Read operation type — EOF here is the normal end-of-file condition
		var op byte
		if err := binary.Read(s.walFile, binary.BigEndian, &op); err != nil {
			if err == io.EOF {
				break
			}
			// Stretch: graceful truncation handling — treat unexpected errors
			// (including io.ErrUnexpectedEOF) as a partial record and stop replay.
			break
		}

		// Read key length
		var keyLen uint32
		if err := binary.Read(s.walFile, binary.BigEndian, &keyLen); err != nil {
			// Truncated record — stop replay gracefully
			break
		}

		// Read value length
		var valLen uint32
		if err := binary.Read(s.walFile, binary.BigEndian, &valLen); err != nil {
			break
		}

		// Read key bytes
		keyBuf := make([]byte, keyLen)
		if _, err := io.ReadFull(s.walFile, keyBuf); err != nil {
			break
		}

		// Read value bytes
		valBuf := make([]byte, valLen)
		if valLen > 0 {
			if _, err := io.ReadFull(s.walFile, valBuf); err != nil {
				break
			}
		}

		switch op {
		case opPut:
			s.data[string(keyBuf)] = string(valBuf)
		case opDelete:
			delete(s.data, string(keyBuf))
		}
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

	// Write one Put record per live entry directly to temp file
	for key, value := range s.data {
		if err := binary.Write(tmpFile, binary.BigEndian, opPut); err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write op error: %w", err)
		}
		if err := binary.Write(tmpFile, binary.BigEndian, uint32(len(key))); err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write key length error: %w", err)
		}
		if err := binary.Write(tmpFile, binary.BigEndian, uint32(len(value))); err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write value length error: %w", err)
		}
		if _, err := tmpFile.Write([]byte(key)); err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write key error: %w", err)
		}
		if _, err := tmpFile.Write([]byte(value)); err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write value error: %w", err)
		}
	}

	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("sync temp file error: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp file error: %w", err)
	}

	// Close current WAL file
	if err := s.walFile.Close(); err != nil {
		return fmt.Errorf("close WAL file error: %w", err)
	}

	// Rename temp over original
	if err := os.Rename(tmpPath, s.walPath); err != nil {
		return fmt.Errorf("rename error: %w", err)
	}

	// Reopen WAL file in append mode
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
