const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { readFile } = require('node:fs/promises')
const { resolve } = require('node:path')
const { chromium } = require('playwright')
const JSZip = require('jszip')

const root = resolve(__dirname, '..', '..')
const port = 4179
const baseUrl = `http://127.0.0.1:${port}/visual-style-website/`

async function waitForServer(url, timeout = 20_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  return undefined
}

async function main() {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
  try {
    await waitForServer(baseUrl)
    const executablePath = chromePath()
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile page overflows horizontally')

    for (const index of [0, 1, 2]) await page.locator('.petal').nth(index).click()
    await page.locator('.next-button').click()
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(await page.locator('h1').innerText(), '把今天编在一起', 'sessionStorage did not restore the current chapter')

    for (const index of [0, 1, 2, 3]) await page.locator('.wreath-slot').nth(index).click()
    assert.equal(await page.locator('.wreath-slot[aria-pressed="true"]').count(), 4)
    await page.locator('.next-button').click()
    await page.locator('.friend-card').first().click()
    await page.locator('.next-button').click()
    await page.locator('.group-button').click()
    await page.locator('.activity-card').first().click()
    await page.locator('.next-button').click()
    assert.match(new URL(page.url()).search, /woven=/, 'share URL does not include wreath data')
    assert.equal(await page.locator('.shot-thumbnail').count(), 6)
    await page.getByRole('button', { name: /收好今天的六个片刻/ }).click()
    await page.getByRole('link', { name: /保存双版分镜包/ }).waitFor({ timeout: 60_000 })
    assert.match(await page.locator('.export-progress').innerText(), /已准备好/)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: /保存双版分镜包/ }).click()
    const download = await downloadPromise
    const zip = await JSZip.loadAsync(await readFile(await download.path()))
    const metadata = JSON.parse(await zip.file('storyboard.json').async('string'))
    assert.equal(metadata.export.status, 'complete')
    assert.equal(metadata.shots.length, 6)
    assert.equal(Object.keys(zip.files).filter((name) => /^images\/.*\.jpg$/.test(name)).length, 12)
    const sharedUrl = page.url()
    await page.goto(sharedUrl, { waitUntil: 'networkidle' })
    assert.match(await page.locator('.memory-line').innerText(), /花环里/)

    const trigger = page.locator('.shot-thumbnail').first()
    await trigger.click()
    assert.equal(await page.locator('[role="dialog"]').count(), 1)
    assert.equal(await page.locator('.lightbox-close').evaluate((element) => element === document.activeElement), true, 'lightbox did not receive focus')
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('[role="dialog"]').count(), 0, 'Escape did not close lightbox')
    await page.waitForFunction(() => document.activeElement?.classList.contains('shot-thumbnail'))
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true, 'lightbox did not restore trigger focus')
    assert.deepEqual(errors, [])
    await browser.close()
    console.log('E2E smoke passed')
  } finally {
    server.kill()
  }
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
