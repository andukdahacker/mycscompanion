/** @type {import('@lhci/cli').Config} */
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        },
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'total-byte-weight': ['warn', { maxNumericValue: 500000 }],
        'resource-summary:script:size': ['error', { maxNumericValue: 51200 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        // These audits don't produce values for static sites served locally
        'lcp-lazy-loaded': 'off',
        'non-composited-animations': 'off',
        'prioritize-lcp-image': 'off',
        'errors-in-console': 'off',
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse-results',
    },
  },
}
