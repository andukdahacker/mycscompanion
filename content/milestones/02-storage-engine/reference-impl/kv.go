package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"sync"
)

// KVStore is a simple in-memory key-value store with disk persistence.
type KVStore struct {
	mu       sync.Mutex
	data     map[string]string
	filePath string
	file     *os.File
}

// NewKVStore creates a new KVStore backed by the given file path.
func NewKVStore(filePath string) (*KVStore, error) {
	store := &KVStore{
		data:     make(map[string]string),
		filePath: filePath,
	}

	f, err := os.OpenFile(filePath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open data file: %w", err)
	}
	store.file = f

	if err := store.loadFromDisk(); err != nil {
		store.file.Close()
		return nil, fmt.Errorf("failed to load data: %w", err)
	}

	return store, nil
}

// Close flushes data to disk and closes the underlying file.
func (s *KVStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.saveToDisk(); err != nil {
		s.file.Close()
		return err
	}
	if err := s.file.Sync(); err != nil {
		s.file.Close()
		return err
	}
	return s.file.Close()
}

// Get retrieves the value associated with the given key.
func (s *KVStore) Get(key string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	val, ok := s.data[key]
	return val, ok
}

// Put stores a key-value pair and persists the change to disk.
func (s *KVStore) Put(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data[key] = value
	return s.saveToDisk()
}

// Delete removes a key from the store and persists the change to disk.
func (s *KVStore) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.data, key)
	return s.saveToDisk()
}

// saveToDisk writes all key-value pairs to the data file in binary format.
// Format per entry: [key_len:4 bytes][key bytes][value_len:4 bytes][value bytes]
func (s *KVStore) saveToDisk() error {
	// Seek to beginning and truncate
	if _, err := s.file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek error: %w", err)
	}
	if err := s.file.Truncate(0); err != nil {
		return fmt.Errorf("truncate error: %w", err)
	}

	for key, value := range s.data {
		// Write key length + key
		if err := binary.Write(s.file, binary.BigEndian, uint32(len(key))); err != nil {
			return fmt.Errorf("write key length error: %w", err)
		}
		if _, err := s.file.Write([]byte(key)); err != nil {
			return fmt.Errorf("write key error: %w", err)
		}

		// Write value length + value
		if err := binary.Write(s.file, binary.BigEndian, uint32(len(value))); err != nil {
			return fmt.Errorf("write value length error: %w", err)
		}
		if _, err := s.file.Write([]byte(value)); err != nil {
			return fmt.Errorf("write value error: %w", err)
		}
	}

	return nil
}

// loadFromDisk reads all key-value pairs from the data file into memory.
func (s *KVStore) loadFromDisk() error {
	if _, err := s.file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek error: %w", err)
	}

	for {
		// Read key length
		var keyLen uint32
		if err := binary.Read(s.file, binary.BigEndian, &keyLen); err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("read key length error: %w", err)
		}

		// Read key
		keyBuf := make([]byte, keyLen)
		if _, err := io.ReadFull(s.file, keyBuf); err != nil {
			return fmt.Errorf("read key error: %w", err)
		}

		// Read value length
		var valLen uint32
		if err := binary.Read(s.file, binary.BigEndian, &valLen); err != nil {
			return fmt.Errorf("read value length error: %w", err)
		}

		// Read value
		valBuf := make([]byte, valLen)
		if _, err := io.ReadFull(s.file, valBuf); err != nil {
			return fmt.Errorf("read value error: %w", err)
		}

		s.data[string(keyBuf)] = string(valBuf)
	}

	return nil
}
