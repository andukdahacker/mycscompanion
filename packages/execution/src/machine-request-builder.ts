import type { FlyCreateMachineRequest } from './fly-api-types.js'
import type { FlyMachineConfig } from './index.js'

/** Maximum user code size in bytes (64 KB). Validated before base64 encoding. */
export const MAX_CODE_SIZE_BYTES = 64 * 1024

export interface BuildMachineRequestOptions {
  readonly submissionId: string
  readonly milestoneId: string
  readonly region?: string
}

/** Builds a FlyCreateMachineRequest from internal config + user code.
 *  Maps camelCase internal fields to snake_case Fly API fields. */
export function buildMachineRequest(
  config: FlyMachineConfig,
  code: string,
  options: BuildMachineRequestOptions,
): FlyCreateMachineRequest {
  const codeBytes = Buffer.byteLength(code, 'utf-8')
  if (codeBytes > MAX_CODE_SIZE_BYTES) {
    throw new Error(
      `Code size exceeds maximum of ${MAX_CODE_SIZE_BYTES / 1024} KB (${codeBytes} bytes)`,
    )
  }

  const encodedCode = Buffer.from(code, 'utf-8').toString('base64')
  const region = options.region ?? config.region

  return {
    ...(region !== undefined ? { region } : {}),
    config: {
      image: config.image,
      auto_destroy: config.autoDestroy,
      guest: {
        cpu_kind: config.cpuKind,
        cpus: config.cpus,
        memory_mb: config.memoryMb,
      },
      init: {
        exec: [
          'sh',
          '-c',
          'ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1',
        ],
      },
      restart: {
        policy: config.restartPolicy,
      },
      services: [],
      files: [
        {
          guest_path: '/workspace/main.go',
          raw_value: encodedCode,
        },
      ],
      metadata: {
        submission_id: options.submissionId,
        milestone_id: options.milestoneId,
      },
    },
  }
}
