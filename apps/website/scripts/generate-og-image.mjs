// Requires playwright-core installed: pnpm --filter website add -D playwright-core
// One-shot script — run manually to regenerate public/og/default.png
import { chromium } from 'playwright-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1200, height: 630 })

const htmlPath = path.join(__dirname, 'og-image.html')
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })

const outputPath = path.join(__dirname, '..', 'public', 'og', 'default.png')
await page.screenshot({ path: outputPath, type: 'png' })

await browser.close()

// eslint-disable-next-line no-console
console.log(`OG image saved to ${outputPath}`)
