import puppeteer from 'puppeteer'
import { setTimeout } from 'node:timers/promises'

const args = [
    '--no-sandbox', 
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled', // 自動化検出を回避
]

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

// User Agentをより本物らしくする
const userAgent = await browser.userAgent()
await page.setUserAgent(userAgent.replace('Headless', '').replace('Chrome', 'Chrome'))

// WebDriverプロパティを隠す
await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
    })
})

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
    
    // Cloudflareチェックボックスの処理 - より人間らしく
    console.log('Cloudflare Turnstileの処理開始')
    await setTimeout(1000 + Math.random() * 1000) // ランダムな待機
    
    try {
        const frames = page.frames()
        const cfFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'))
        
        if (cfFrame) {
            console.log('Cloudflareフレーム発見')
            
            // iframe内のbodyが読み込まれるまで待つ
            await cfFrame.waitForSelector('body', { timeout: 10000 })
            await setTimeout(500 + Math.random() * 500) // ランダムな遅延
            
            // マウスを動かしてからクリック（より人間らしく）
            const box = await cfFrame.evaluate(() => {
                const body = document.body
                return {
                    x: body.offsetWidth / 2,
                    y: body.offsetHeight / 2,
                    width: body.offsetWidth,
                    height: body.offsetHeight
                }
            })
            
            console.log('フレームサイズ:', box)
            
            // ランダムな位置をクリック（中央付近）
            const clickX = box.x + (Math.random() * 20 - 10)
            const clickY = box.y + (Math.random() * 20 - 10)
            
            console.log(`クリック位置: (${clickX}, ${clickY})`)
            
            // ゆっくりクリック
            await cfFrame.click('body', { 
                offset: { x: clickX, y: clickY },
                delay: Math.random() * 100 // クリックに遅延
            })
            
            console.log('クリック完了、検証待機中...')
            
            // 検証完了を待つ（長めに）
            await setTimeout(8000)
            
            // 検証が完了したか確認
            const iframeStillExists = page.frames().some(f => f.url().includes('challenges.cloudflare.com'))
            if (iframeStillExists) {
                console.log('警告: Cloudflareフレームがまだ存在します')
            } else {
                console.log('Cloudflare検証完了')
            }
        }
    } catch (err) {
        console.error('Cloudflareチェック処理でエラー:', err.message)
    }
    
    // 最後のボタンをクリック
    await setTimeout(2000)
    console.log('最終ボタンをクリック')
    await page.locator('text=無料VPSの利用を継続する').click()
    
    console.log('処理完了！')
    
} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
