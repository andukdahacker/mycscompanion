import { describe, it, expect, afterEach, vi } from 'vitest'
import { parseSSEStream } from './parse-sse-stream'

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

async function collectEvents<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const events: T[] = []
  for await (const event of parseSSEStream<T>(stream)) {
    events.push(event)
  }
  return events
}

describe('parseSSEStream', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should parse a single SSE event from stream', async () => {
    const stream = createMockStream(['data: {"type":"text_delta","delta":"hello"}\n\n'])

    const events = await collectEvents<{ type: string; delta: string }>(stream)

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'hello' })
  })

  it('should parse multiple events split across chunks', async () => {
    const stream = createMockStream([
      'data: {"type":"text_delta","delta":"he',
      'llo"}\n\ndata: {"type":"message_complete","id":"m1"}\n\n',
    ])

    const events = await collectEvents<{ type: string; delta?: string; id?: string }>(stream)

    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'hello' })
    expect(events[1]).toEqual({ type: 'message_complete', id: 'm1' })
  })

  it('should skip heartbeat comments', async () => {
    const stream = createMockStream([
      ':heartbeat\n\ndata: {"type":"text_delta","delta":"hi"}\n\n:keepalive\n\n',
    ])

    const events = await collectEvents<{ type: string; delta: string }>(stream)

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'hi' })
  })

  it('should handle incomplete chunks by buffering across reads', async () => {
    const stream = createMockStream([
      'data: {"type":"tex',
      't_delta","delt',
      'a":"buffered"}\n',
      '\n',
    ])

    const events = await collectEvents<{ type: string; delta: string }>(stream)

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'buffered' })
  })

  it('should release reader lock on completion', async () => {
    const stream = createMockStream(['data: {"type":"done"}\n\n'])

    // Consume the stream fully
    await collectEvents<{ type: string }>(stream)

    // If lock was released, we should be able to get a new reader
    const reader = stream.getReader()
    const { done } = await reader.read()
    expect(done).toBe(true)
    reader.releaseLock()
  })
})
