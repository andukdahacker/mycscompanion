package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "test":
		runTests()
	case "benchmark":
		runBenchmark()
	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Usage: <binary> <command>")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  test                Run acceptance criteria tests")
	fmt.Println("  benchmark <name>    Run a performance benchmark")
	fmt.Println()
	fmt.Println("Benchmarks:")
	fmt.Println("  sequential-inserts-wal    Measure WAL append throughput")
	fmt.Println("  crash-recovery-replay     Measure WAL replay throughput")
}
