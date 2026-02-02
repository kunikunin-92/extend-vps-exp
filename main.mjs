import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { setTimeout } from 'node:timers/promises'

// ステルスプラグインを追加（Cloudflare対策）
puppeteer.use(StealthPlugin())

const args = [
    '--no-sandbox', 
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-web-security',
]

if (process.env.PROXY_SERVER) {
    const proxy_url = new URL(process.env.PROXY_SERVER)
    proxy_url.username = ''
    proxy_url.password = ''
    args.push(`--proxy-server=${proxy_url}`.replace(/\/$/, ''))
}

const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1080, height: 1024 },
    args,
})

const [page] = await browser.pages()
const recorder = await page.screencast({ path: 'recording.webm' })

try {
    if (process.env.PROXY_SERVER) {
        const { username, password } = new URL(process.env.PROXY_SERVER)
        if (username && password) {
            await page.authenticate({ username, password })
        }
    }
    
    console.log('ログインページへ移動')
    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    
    console.log('ログイン情報入力')
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    console.log('VPS詳細ページへ')
    await page.locator('a[href^="/xapanel/xvps/server/detail?id="]').click()
    
    console.log('更新ボタンをクリック')
    await page.locator('text=更新する').click()
    
    console.log('継続ボタンをクリック')
    await page.locator('text=引き続き無料VPSの利用を継続する').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    console.log('CAPTCHA画像を取得')
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { 
        method: 'POST', 
        body 
    }).then(r => r.text())
    
    console.log('CAPTCHA入力:', code)
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)
    
    // Cloudflareチェックボックスの処理
    console.log('Cloudflare処理開始')
    await setTimeout(2000) // 少し待つ
    
    try {
        // Cloudflareのiframeを探す
        const frames = page.frames()
        const cfFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'))
        
        if (cfFrame) {
            console.log('Cloudflareフレーム発見、待機中...')
            
            // iframeが完全に読み込まれるまで待つ
            await cfFrame.waitForSelector('body', { timeout: 10000 })
            await setTimeout(2000)
            
            // マウス移動をシミュレート
            console.log('マウス移動をシミュレート')
            await page.mouse.move(100, 100)
            await setTimeout(300)
            await page.mouse.move(200, 200)
            await setTimeout(300)
            
            // フレーム内をクリック
            const box = await cfFrame.evaluate(() => {
                const body = document.body
                const rect = body.getBoundingClientRect()
                return {
                    x: rect.width / 2,
                    y: rect.height / 2
                }
            })
            
            console.log('Cloudflareチェックをクリック')
            await cfFrame.click('body', { 
                offset: { x: box.x, y: box.y },
                delay: 150 
            })
            
            // 検証完了を長めに待つ
            console.log('検証待機中... (最大15秒)')
            let attempts = 0
            while (attempts < 15) {
                await setTimeout(1000)
                const stillExists = page.frames().some(f => f.url().includes('challenges.cloudflare.com'))
                if (!stillExists) {
                    console.log('✓ Cloudflare検証成功！')
                    break
                }
                attempts++
                console.log(`待機中... ${attempts}/15秒`)
            }
            
            if (attempts >= 15) {
                console.log('⚠ Cloudflare検証タイムアウト、続行を試みます')
            }
        } else {
            console.log('Cloudflareフレームなし')
        }
    } catch (err) {
        console.error('Cloudflare処理エラー:', err.message)
    }
    
    // 最終ボタンをクリック
    console.log('最終ボタンをクリック')
    await setTimeout(2000)
    await page.locator('text=無料VPSの利用を継続する').click()
    
    console.log('✓ 処理完了！')
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
        console.log('ナビゲーション待機タイムアウト（正常終了の可能性あり）')
    })
    
} catch (e) {
    console.error('エラー発生:', e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
    console.log('ブラウザクローズ完了')
}
