export async function* parseSSEStream<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop()!
      for (const part of parts) {
        if (part.startsWith(':')) continue // heartbeat
        const dataLine = part.split('\n').find((line) => line.startsWith('data: '))
        if (!dataLine) continue
        yield JSON.parse(dataLine.slice(6)) as T
      }
    }
  } finally {
    reader.releaseLock()
  }
}
