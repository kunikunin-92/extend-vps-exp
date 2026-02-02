import puppeteer from 'puppeteer'
import { setTimeout } from 'node:timers/promises'
const args = ['--no-sandbox', '--disable-setuid-sandbox']
if (process.env.PROXY_SERVER) {
    const proxy_url = new URL(process.env.PROXY_SERVER)
    proxy_url.username = ''
    proxy_url.password = ''
    args.push(`--proxy-server=${proxy_url}`.replace(/\/$/, ''))
}
const browser = await puppeteer.launch({
    defaultViewport: { width: 1080, height: 1024 },
    args,
})
const [page] = await browser.pages()
const userAgent = await browser.userAgent()
await page.setUserAgent(userAgent.replace('Headless', ''))
const recorder = await page.screencast({ path: 'recording.webm' })
try {
    if (process.env.PROXY_SERVER) {
        const { username, password } = new URL(process.env.PROXY_SERVER)
        if (username && password) {
            await page.authenticate({ username, password })
        }
    }
    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    await page.locator('a[href^="/xapanel/xvps/server/detail?id="]').click()
    await page.locator('text=更新する').click()
    await page.locator('text=引き続き無料VPSの利用を継続する').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { method: 'POST', body }).then(r => r.text())
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)
    
    // Cloudflareチェックボックスの処理
    await setTimeout(2000)
    
    // 方法1: iframe内を探す
    try {
        const frames = page.frames()
        console.log('利用可能なフレーム数:', frames.length)
        
        for (const frame of frames) {
            console.log('フレームURL:', frame.url())
        }
        
        // Cloudflare Turnstileのiframeを探す
        const cfFrame = frames.find(f => 
            f.url().includes('cloudflare') || 
            f.url().includes('turnstile') ||
            f.url().includes('challenges')
        )
        
        if (cfFrame) {
            console.log('Cloudflareフレーム発見:', cfFrame.url())
            // iframeが読み込まれるまで待つ
            await setTimeout(2000)
            
            // チェックボックスまたはクリック可能な要素を探す
            const checkboxSelector = 'input[type="checkbox"], label, div[role="checkbox"]'
            await cfFrame.waitForSelector(checkboxSelector, { timeout: 10000 })
            await cfFrame.click(checkboxSelector)
            console.log('Cloudflareチェックボックスをクリックしました')
            await setTimeout(3000)
        } else {
            console.log('Cloudflareフレームが見つかりません、ページ上で探します')
            
            // 方法2: ページ上で直接探す
            const selectors = [
                'input[type="checkbox"]',
                'iframe[src*="cloudflare"]',
                'iframe[src*="turnstile"]',
                'div.cf-turnstile',
                '#cf-turnstile',
                '[id*="turnstile"]',
                '[class*="turnstile"]'
            ]
            
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 })
                    console.log(`セレクタ ${selector} が見つかりました`)
                    await page.click(selector)
                    await setTimeout(3000)
                    break
                } catch (e) {
                    console.log(`セレクタ ${selector} が見つかりませんでした`)
                }
            }
        }
    } catch (err) {
        console.error('Cloudflareチェック処理でエラー:', err.message)
        // エラーでも続行を試みる
    }
    
    await page.locator('text=無料VPSの利用を継続する').click()
} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
