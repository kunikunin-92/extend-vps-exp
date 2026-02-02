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
    
    try {
        console.log('Cloudflare Turnstileの処理開始')
        
        // Cloudflareのiframeを探す
        const frames = page.frames()
        const cfFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'))
        
        if (cfFrame) {
            console.log('Cloudflareフレーム発見:', cfFrame.url())
            
            // iframe内のbodyが読み込まれるまで待つ
            await cfFrame.waitForSelector('body', { timeout: 10000 })
            console.log('フレームのbodyが読み込まれました')
            
            // フレーム内の全要素を取得してみる
            const elements = await cfFrame.evaluate(() => {
                return {
                    html: document.body.innerHTML.substring(0, 500),
                    clickableElements: Array.from(document.querySelectorAll('*'))
                        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0)
                        .map(el => ({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            type: el.type
                        }))
                        .slice(0, 10) // 最初の10個だけ
                }
            })
            console.log('フレーム内のHTML:', elements.html)
            console.log('クリック可能な要素:', JSON.stringify(elements.clickableElements))
            
            // 色々な方法でクリックを試す
            const clickAttempts = [
                // 方法1: body全体をクリック
                async () => {
                    console.log('試行: bodyをクリック')
                    await cfFrame.click('body')
                },
                // 方法2: 中央をクリック
                async () => {
                    console.log('試行: 中央座標をクリック')
                    const box = await cfFrame.evaluate(() => {
                        const body = document.body
                        return {
                            x: body.offsetWidth / 2,
                            y: body.offsetHeight / 2
                        }
                    })
                    await cfFrame.click('body', { offset: { x: box.x, y: box.y } })
                },
                // 方法3: divやspanをクリック
                async () => {
                    console.log('試行: div/spanをクリック')
                    const selectors = ['div', 'span', 'label']
                    for (const sel of selectors) {
                        try {
                            await cfFrame.click(sel)
                            console.log(`${sel}をクリック成功`)
                            break
                        } catch (e) {
                            // 次へ
                        }
                    }
                }
            ]
            
            // 各方法を順番に試す
            for (const attempt of clickAttempts) {
                try {
                    await attempt()
                    console.log('クリック成功、検証を待機中...')
                    await setTimeout(5000) // Cloudflareの検証を待つ
                    break
                } catch (err) {
                    console.log('この方法は失敗:', err.message)
                }
            }
            
        } else {
            console.log('Cloudflareフレームが見つかりません')
        }
    } catch (err) {
        console.error('Cloudflareチェック処理でエラー:', err.message)
    }
    
    // 最後のボタンをクリック
    await setTimeout(2000)
    await page.locator('text=無料VPSの利用を継続する').click()
} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
