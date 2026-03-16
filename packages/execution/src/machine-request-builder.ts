import type { FlyCreateMachineRequest } from './fly-api-types.js'
import type { FlyMachineConfig } from './index.js'

/** Maximum user code size in bytes (64 KB). Validated before base64 encoding. */
export const MAX_CODE_SIZE_BYTES = 64 * 1024

export interface ReferenceFile {
  readonly filename: string
  readonly content: string
}

export interface BuildMachineRequestOptions {
  readonly submissionId: string
  readonly milestoneId: string
  readonly region?: string
  readonly referenceFiles?: readonly ReferenceFile[]
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

  const goMod = 'module workspace\n\ngo 1.23\n'

  const files: Array<{ guest_path: string; raw_value: string }> = [
    {
      guest_path: '/workspace/main.go',
      raw_value: encodedCode,
    },
    {
      guest_path: '/workspace/go.mod',
      raw_value: Buffer.from(goMod, 'utf-8').toString('base64'),
    },
  ]

  if (options.referenceFiles) {
    for (const ref of options.referenceFiles) {
      files.push({
        guest_path: `/reference/${ref.filename}`,
        raw_value: Buffer.from(ref.content, 'utf-8').toString('base64'),
      })
    }
  }

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
          'ulimit -u 64 && go build -o main . 2>&1 && ./main test 2>&1',
        ],
      },
      restart: {
        policy: config.restartPolicy,
      },
      services: [],
      files,
      metadata: {
        submission_id: options.submissionId,
        milestone_id: options.milestoneId,
      },
    },
  }
}
