import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest'
import { ExecutionServiceClient, ExecutionServiceError } from './execution-service-client.js'

const BASE_URL = 'http://localhost:9876'
const SECRET = 'test-secret'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('ExecutionServiceClient', () => {
  describe('execute', () => {
    it('should return correctly typed ExecuteResponse with camelCase fields', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.json({
            stdout: 'hello world\n',
            stderr: '',
            exit_code: 0,
            duration_ms: 1200,
            build_duration_ms: 400,
            run_duration_ms: 800,
            timed_out: false,
          })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)
      const response = await client.execute({
        code: 'cGFja2FnZSBtYWlu',
        args: [],
        timeoutSeconds: 30,
      })

      expect(response.stdout).toBe('hello world\n')
      expect(response.stderr).toBe('')
      expect(response.exitCode).toBe(0)
      expect(response.durationMs).toBe(1200)
      expect(response.buildDurationMs).toBe(400)
      expect(response.runDurationMs).toBe(800)
      expect(response.timedOut).toBe(false)
    })

    it('should map compilation error response correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.json({
            stdout: '',
            stderr: './main.go:3: undefined: foo',
            exit_code: 2,
            duration_ms: 100,
            build_duration_ms: 100,
            run_duration_ms: 0,
            timed_out: false,
          })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)
      const response = await client.execute({
        code: 'cGFja2FnZSBtYWlu',
        args: [],
        timeoutSeconds: 30,
      })

      expect(response.exitCode).toBe(2)
      expect(response.stderr).toContain('undefined: foo')
      expect(response.timedOut).toBe(false)
    })

    it('should throw ExecutionServiceError with status 401 on unauthorized', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)

      const err = await client
        .execute({ code: 'cGFja2FnZSBtYWlu', args: [], timeoutSeconds: 30 })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ExecutionServiceError)
      const e = err as ExecutionServiceError
      expect(e.status).toBe(401)
      expect(e.message).toBe('unauthorized')
      expect(e.isRetryable).toBe(false)
    })

    it('should throw ExecutionServiceError with status 503 on service unavailable', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.json({ error: 'service busy' }, { status: 503 })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)

      const err = await client
        .execute({ code: 'cGFja2FnZSBtYWlu', args: [], timeoutSeconds: 30 })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ExecutionServiceError)
      const e = err as ExecutionServiceError
      expect(e.status).toBe(503)
      expect(e.message).toBe('service busy')
      expect(e.isRetryable).toBe(true)
    })

    it('should throw error on network failure', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.error()
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)

      await expect(
        client.execute({ code: 'cGFja2FnZSBtYWlu', args: [], timeoutSeconds: 30 }),
      ).rejects.toThrow()
    })

    it('should send snake_case fields in request body', async () => {
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${BASE_URL}/execute`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>
          return HttpResponse.json({
            stdout: '',
            stderr: '',
            exit_code: 0,
            duration_ms: 0,
            build_duration_ms: 0,
            run_duration_ms: 0,
            timed_out: false,
          })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)
      await client.execute({
        code: 'cGFja2FnZSBtYWlu',
        args: ['--flag'],
        timeoutSeconds: 45,
      })

      expect(capturedBody).not.toBeNull()
      expect(capturedBody!['timeout_seconds']).toBe(45)
      expect(capturedBody!['code']).toBe('cGFja2FnZSBtYWlu')
      expect(capturedBody!['args']).toEqual(['--flag'])
      // Verify camelCase is NOT sent
      expect(capturedBody!['timeoutSeconds']).toBeUndefined()
    })

    it('should map timed_out: true to timedOut: true', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.json({
            stdout: '',
            stderr: 'signal: killed',
            exit_code: 137,
            duration_ms: 3000,
            build_duration_ms: 500,
            run_duration_ms: 2500,
            timed_out: true,
          })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)
      const response = await client.execute({
        code: 'cGFja2FnZSBtYWlu',
        args: [],
        timeoutSeconds: 3,
      })

      expect(response.timedOut).toBe(true)
      expect(response.exitCode).toBe(137)
    })

    it('should throw ExecutionServiceError with status 400 and error message on bad request', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return HttpResponse.json({ error: 'code too large' }, { status: 400 })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)

      const err = await client
        .execute({ code: 'cGFja2FnZSBtYWlu', args: [], timeoutSeconds: 30 })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ExecutionServiceError)
      const e = err as ExecutionServiceError
      expect(e.status).toBe(400)
      expect(e.message).toBe('code too large')
      expect(e.isRetryable).toBe(false)
    })

    it('should handle non-JSON error response from reverse proxy', async () => {
      server.use(
        http.post(`${BASE_URL}/execute`, () => {
          return new HttpResponse('<html>Bad Gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)

      const err = await client
        .execute({ code: 'cGFja2FnZSBtYWlu', args: [], timeoutSeconds: 30 })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ExecutionServiceError)
      const e = err as ExecutionServiceError
      expect(e.status).toBe(502)
      expect(e.isRetryable).toBe(false)
    })

    it('should send Authorization Bearer header', async () => {
      let capturedAuth: string | null = null

      server.use(
        http.post(`${BASE_URL}/execute`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({
            stdout: '',
            stderr: '',
            exit_code: 0,
            duration_ms: 0,
            build_duration_ms: 0,
            run_duration_ms: 0,
            timed_out: false,
          })
        }),
      )

      const client = new ExecutionServiceClient(BASE_URL, SECRET)
      await client.execute({ code: 'cGFja2FnZSBtYWlu', args: [], timeoutSeconds: 30 })

      expect(capturedAuth).toBe(`Bearer ${SECRET}`)
    })
  })
})
