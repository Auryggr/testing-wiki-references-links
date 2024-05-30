const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');

let slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || '';
let url = 'https://en.m.wikipedia.org';

process.argv.forEach(arg => {
    let value = arg.split('=')[1];
    if (arg.includes('slackwebhook')) {
        slackWebhookUrl = value;
    } else if (arg.includes('url')) {
        url = value;
    }
});

const urlsToVisit = [
    `${url}/wiki/Estée_Lauder_(businesswoman)`,
    `${url}/wiki/The_Estée_Lauder_Companies`,
    `${url}/wiki/The_Estée_Lauder_Companies#Brands`,
    `${url}/wiki/Jo_Malone_London`,
    `${url}/wiki/Clinique`,
    `${url}/wiki/Tom_Ford_(brand)#Tom_Ford_Beauty`,
];
const totalUrlsToVisit = urlsToVisit.length;

async function run() {
    try {
        for (const url of urlsToVisit) {
            try {
                const browser = await chromium.launch();
                const context = await browser.newContext();
                const page = await context.newPage();
                await page.goto(url);

                await page.waitForLoadState('networkidle');

                const content = await page.content();
                const $ = cheerio.load(content);

                const selectors = [
                    '.reference-text',
                ];

                await delay(600);

                await checkLinks(url, $, selectors);

                await browser.close();
            } catch (error) {
                console.error('Error fetching data:', error.message);
                await sendToSlack(`:red_circle: Error fetching data for ${url}. *${error.message}*. Could you please double-check this, <@aurys>?`);
                continue;
            }
        }

        console.log(`Total URLs visited: ${totalUrlsToVisit}`);
        await sendToSlack(`*Total URLs visited:* ${totalUrlsToVisit}`);
        console.log('All URLs processed.');
    } catch (error) {
        console.error('Error:', error.message);
        await sendToSlack(` >The links-status test has some troubles. _Please review the code_ :eyes:`);
    }
}

async function checkLinks(url, $, selectors) {
    const wikiURL = "https://en.m.wikipedia.org";
    let totalLinksReviewed = 0;

    for (const selector of selectors) {
        const elements = $(selector);

        elements.each(async (index, element) => {
            const anchors = $(element).find('a').first();

            anchors.each(async (index, anchor) => {
                const href = $(anchor).attr('href');
                const relAttribute = $(anchor).attr('rel');
                totalLinksReviewed++;

                if (!href) {
                    console.error(`Missing href attribute on ${url} for ${selector}`);
                    await sendToSlack(`:red_circle: *Missing href attribute* on ${url} for the selector: ${selector}`);
                    return;
                }

                let fullUrl = href.startsWith('http') ? href : wikiURL + href;

                if (!relAttribute || !relAttribute.includes('nofollow')) {
                    console.error(`Missing rel attribute values on ${url} for ${selector}`);
                    await sendToSlack(`:red_circle: *Missing rel attribute* value on ${url} for the _PL:_ ${href}`);
                }

                try {
                    const response = await axios.get(fullUrl);

                    if (response.status === 200) {
                        console.log(`Link ${fullUrl} is valid. Status Code: ${response.status}`);
                    } else {
                        console.log(`Link ${fullUrl} is not valid. Status Code: ${response.status}`);
                        if (response.status === 404) {
                            console.error(`Attention! 404 error found on ${fullUrl}`);
                            await sendToSlack(`Attention! *404 error* found on ${fullUrl}`);
                        } else {
                            console.error(`Error fetching ${fullUrl}: Status Code ${response.status}`);
                            await sendToSlack(`:red_circle: Link ${fullUrl} is not valid. Status Code: *${response.status}*`);
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching ${fullUrl}:`, error.message);
                    await sendToSlack(`:red_circle: Error fetching ${fullUrl} *on* ${url}. *${error.message}* . Could you please double-check this, <@aurys>`);
                }

                await delay(600);
            });
        });
    }

    console.log(`Link checking completed for ${url}`);
    await sendToSlack(`:large_green_circle: Link checking completed for ${url}`);
    console.log(`Total links reviewed: ${totalLinksReviewed}`);
    await sendToSlack(`Total links reviewed: ${totalLinksReviewed}`);
}

async function sendToSlack(message) {
    try {
        await axios.post(slackWebhookUrl, { text: message });
    } catch (error) {
        console.error('Error sending to Slack:', error.message);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

run();
