# Milestone 2: Storage Engine

## What Changed Since Milestone 1

In Milestone 1, every `Put` rewrote the entire data file from scratch. With 10 keys, that's fine. With 10,000 keys, every single write dumps all 10,000 entries to disk — even though only one changed. That's called *write amplification*, and it's the reason your M1 benchmark topped out around 100 ops/sec.

Real databases don't work this way. They need to handle thousands of writes per second without rewriting the world each time.

## Why This Matters

The solution is one of the oldest ideas in database engineering: the **write-ahead log** (WAL). Instead of rewriting everything, you append each change to the end of a log file. One small write per operation, no matter how big the dataset.

PostgreSQL uses a WAL for every transaction. SQLite has WAL mode. Cloud databases like CockroachDB and TiKV use WALs under RocksDB. Every serious storage engine starts with an append-only log.

## What You're Building

A `WALStore` that replaces M1's full-rewrite approach:

- **Append-only writes** — `Put` and `Delete` each add one record to the end of the log file
- **Crash recovery** — on startup, replay the WAL from beginning to end to rebuild the in-memory map
- **Compaction** — rewrite the WAL with only the live entries, discarding deleted keys and old overwrites

## What You'll Learn

- **Write-ahead logging** — why appending is faster than rewriting, and how logs become the source of truth
- **Append-only file formats** — structured binary records with operation types and length-prefixed fields
- **Crash recovery** — rebuilding state from a log, and why `fsync` matters for durability
- **Tombstones** — marking deletions in an append-only format (you can't just remove a line)
- **Compaction** — reclaiming space by squashing the log down to current state (think `git squash`)
- **Write amplification vs read performance** — the fundamental trade-off you'll revisit in every milestone

## How This Works

Check the concept explainers for visual walkthroughs: **WAL Append Flow** shows how Put and Delete append records, and **Crash Recovery Sequence** shows how data survives a crash through replay.

Each WAL record uses this binary format:

```
[op_type: 1 byte][key_len: 4 bytes][val_len: 4 bytes][key bytes][value bytes]
```

- `op_type` is `0x01` for Put, `0x02` for Delete
- Lengths are encoded as BigEndian `uint32` — same pattern as M1, with an op byte prepended
- Delete records are tombstones: `val_len` is 0, no value bytes

**On Put/Delete:** append the record to the WAL, then `fsync` the file so data reaches disk immediately.

**On startup:** read the WAL from beginning to end. For each record, apply the operation to an in-memory map. Last write wins — if a key was written three times, only the third value matters.

**Compaction:** create a new WAL containing one Put record per live key in the map. Replace the old WAL. This shrinks the file by removing dead entries.

## Your Files

This milestone uses multiple files — a new pattern:

- **`kv.go`** — M1's `KVStore` implementation (read-only). Used by the first test as a confidence-builder. Read it to see "the old way" for contrast.
- **`wal.go`** — Your implementation. This is the only file you edit. It has the `WALStore` struct with TODOs for each method.
- **`harness.go`** — Test runner and benchmark workloads (read-only). Tests your WALStore against the acceptance criteria.
- **`main.go`** — CLI entry point (read-only). Routes `test` and `benchmark` commands.

## Constraints

- **Go standard library only** — `encoding/binary`, `os`, `io`, `fmt`, `sync`
- **Single `package main`** across all files
- **`wal.go` is the only file you edit** — everything else is read-only
