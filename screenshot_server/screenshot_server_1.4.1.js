/*
    Screenshot Sevice API  ver. 1.4.1
    Exposing an API server that handles requests for taking a screenshot for a URL
 */
const express = require('express')
const crypto = require('crypto')
const puppeteer = require('puppeteer')
const fs = require('fs')
const commandLineArgs = require('command-line-args')
const commandLineUsage = require('command-line-usage')

const optionDefinitions = [
    {name: 'port', alias: 'p', type: Number, default: 8616},
    {name: 'chrome', alias: 'c', type: String, default: '/opt/google/chrome/google-chrome'},
    {name: 'help', alias: 'h', type: Boolean, default: false}
]
const sections = [
    {
        header: 'screenshot_server.js version:1.4',
        content: 'Screenshot API service'
    },
    {
        header: 'Arguments',
        optionList: [
            {
                name: 'port',
                alias: 'p',
                typeLabel: '{underline port_number}',
                description: 'Port number the server will be listening on. default 8616.'
            },
            {
                name: 'chrome',
                alias: 'c',
                typeLabel: '{underline chrome_path}',
                description: 'Location of Chrome executable, default "/opt/google/chrome/google-chrome".'
            },
            {
                name: 'help',
                alias: 'h',
                description: 'Print this usage guide.'
            }
        ]
    }
]
const options = commandLineArgs(optionDefinitions)
const usage = commandLineUsage(sections)
const app = express()


if (options.help) {
    console.log(usage)
    process.exit(1)
}


var port = options.port || 8616;
var browser = null;
var pngFileDir = __dirname + '/pngs/';
var chromeExePath = options.chrome || '/opt/google/chrome/google-chrome';


(async () => {
    if (process.platform === 'darwin' && !options.chrome) {
        console.log('Running in the MacOS. Launch with default chromium')
        browser = await puppeteer.launch({
            headless: true,
            args: ['--disable-dev-shm-usage']
        })
    } else {
        if (!fs.existsSync(chromeExePath)) {
            console.log('Error! Cannot find Chrome at:', chromeExePath)
            process.exit(1)
        }
        console.log('Running with Chrome:', chromeExePath)
        browser = await puppeteer.launch({
            headless: true,
            executablePath: chromeExePath,
            args: ['--disable-dev-shm-usage']
        })
    }
})()

if (!fs.existsSync(pngFileDir)) {
    fs.mkdirSync(pngFileDir)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// returns params with each field parsed
// params.success will be false if there is any error and message will be in params.errorMsg
// if success, params will have each fi
function parseQueryParam(request) {
    let params = {
        success: true
    }
    let errorMsg = null

    function convertInt(s, defaultValue, paramName) {
        // if not supplied
        if (!s) return defaultValue
        if (!isNaN(s)) return parseInt(s)

        // otherwise something is wrong
        errorMsg = 'Invalid param "' + paramName + '" value "' + s + '"'
    }

    function convertBool(s, defaultValue, paramName) {
        if (!s) return defaultValue

        if (s.toUpperCase() === 'TRUE') return true
        if (s.toUpperCase() === 'FALSE') return false

        errorMsg = 'Invalid param "' + paramName + '" value "' + s + '" (value has to be true or false)'
    }

    // supported parameters. compatible with urlbox.io
    params.link = request.query.url
    params.userAgent = request.query.user_agent
    params.delay = convertInt(request.query.delay, 0, 'delay') // Integer Amount of time to wait in milliseconds before taking screenshot
    params.force = convertBool(request.query.force, false, 'force') // Boolean Take a fresh screenshot instead of getting a cached version
    params.full_page = convertBool(request.query.full_page, false, 'full_page') // Boolean Specify whether to capture the full scrollable area of the website
    params.width = convertInt(request.query.width, 1024, 'width') // Integer: Viewport width of the browser in pixels
    params.timeout = convertInt(request.query.timeout, 30000, 'timeout') // maximum miliseconds waiting for page load
    params.ttl = convertInt(request.query.ttl, 2592000, 'ttl')  // Short for 'time to live'. Number of seconds to keep a screenshot in the cache.
    params.scroll = convertBool(request.query.scroll, false, 'scroll') // Boolean: whether to automatically scroll to the bottom of the page to force loading lazy load assets

    if (!params.link) errorMsg = 'Bad user input: missing url parameter'


    if (errorMsg) {
        params = {
            success: false,
            errorMsg: errorMsg
        }
    }
    return params
}

async function autoScroll(page) {
    console.log("Autoscroll to the bottom of the page")
    await page.evaluate( async () =>{
        let maxScrollY = 50000
        async function autoScrolling() {
            function sleep(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            while (window.scrollY < maxScrollY) {
                let oldScrollY = window.scrollY
                window.scrollTo(0, oldScrollY + window.innerHeight)
                console.log("scrolling", oldScrollY, window.scrollY)
                await sleep(100)
                if (window.scrollY == oldScrollY) {
                    break
                }
            }
        }
        await autoScrolling()
    })

}

app.get('/png', (request, response) => {

    let params = parseQueryParam(request)
    if (!params.success) {
        // HTTP status code 400 means invalid user input
        response.status(400);
        response.send(params.errorMsg);
        return
    }

    if (!params.link.startsWith('http')) params.link = 'https://' + params.link

    let fileNameKey = params.link + params.userAgent + params.delay + params.force  + params.full_page + params.width
    let pngFile = pngFileDir + crypto.createHash('sha1').update(fileNameKey).digest('hex')+'.png'
    console.log('Taking the screenshot of url:', params.link, 'screenshot file:', pngFile)


    if (!params.force && fs.existsSync(pngFile)) {
        // check TTL
        let fileAge = (Date.now() - fs.statSync(pngFile).birthtime)/1000
        if (fileAge < params.ttl) {
            console.log(pngFile, "exists in the cache and age", fileAge, '< ttl', params.ttl)
            response.sendFile(pngFile)
        }
    } else {
        // take screenshot
        (async () => {
            try {
                let page = await browser.newPage()
                if (params.userAgent) await page.setUserAgent(params.userAgent)
                await page.setViewport({width: params.width, height: 768})
                try {
                    await page.goto(params.link, {timeout: params.timeout})
                } catch (e) {
                    console.log(e.name, e.message)
                }

                if (params.delay) await sleep(params.delay)

                if (params.scroll) await autoScroll(page)

                await page.screenshot({
                    path: pngFile,
                    fullPage: params.full_page
                })
                response.sendFile(pngFile)
                await page.close()
            } catch (err) {
                console.log("Error taking screenshot:", err.name, err.message)
                response.status(500)
                response.send(err.name + err.message)
            }
        })()

    }
})


app.listen(port, (err) => {
    if (err) {
        return console.log('Failed to start server', err.name)
    }

    console.log(`server is listening on ${port}`)
})
