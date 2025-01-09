const fs = require('fs')
const cors = require('cors')
const https = require('https')
const config = require('./config')
const express = require('express')
const bodyParser = require('body-parser')
const quotes = require('./quotes/quotes')
const { bestGuess } = require('./quotes/names')
const { stripPunctuation } = require('poop-sock')

const port = 443
const maxQuotes = 10

quotes.loadQuotes()

const options = {
    key: fs.readFileSync(__dirname + '/cert/privatekey.pem', 'utf8'),
    cert: fs.readFileSync(__dirname + '/cert/certificate.pem', 'utf8'),
    ca: [ fs.readFileSync(__dirname + '/cert/origin_ca_ecc_root.pem', 'utf8'),
        fs.readFileSync(__dirname + '/cert/origin_ca_rsa_root.pem', 'utf8') ],
}

var app = express()
app.use(cors())

var jsonParser = bodyParser.json()

// require('http').createServer(app).listen(port, '0.0.0.0', () => {
https.createServer(options, app).listen(port, '0.0.0.0', () => {
    console.log(`Express server listening on port ${port}`)
})

app.get('/', (req, res) => {
    res.status(200).send({
        numQuotes: quotes.getAllQuotes().length
    })
})

const LEVEL_GENERAL = 1
const LEVEL_ADMIN = 2

const checkPerms = (request, level) => {
    if (request === undefined || request.query === undefined || typeof request.query.pwd != 'string') {
        return 400
    }
    if (level === LEVEL_ADMIN) {
        if (request.query.pwd === config.adminPassword) {
            return 200
        }
        else if (request.query.pwd === config.generalPassword) {
            return 401
        }
        else {
            return 403
        }
    }
    else if (level === LEVEL_GENERAL) {
        if (request.query.pwd === config.generalPassword || request.query.pwd === config.adminPassword) {
            return 200
        }
        else {
            return 403
        }
    }
    return 500
}

app.get('/perms', (request, response) => {
    const perms = checkPerms(request, LEVEL_ADMIN)
    if (perms === 400 || perms === 500) {
        return response.status(perms).json({})
    }
    const resBody = {
        level: 0
    }
    if (perms === 200) {
        resBody.level = 2
    }
    else if (perms === 401) {
        resBody.level = 1
    }
    response.send(resBody)
})

const processGET_quotes = query => {
    let numQuotes = 1
    if (query !== undefined && !isNaN(query.numQuotes)) {
        numQuotes = parseInt(numQuotes)
    }
    numQuotes = Math.min(Math.max(0, numQuotes), maxQuotes)
    const res = {
        numQuotes,
        quotes: []
    }
    for (let i = 0; i < numQuotes; i++) {
        let quote = undefined
        while (quote === undefined || res.quotes.map(x => x.id).includes(quote.id)) {
            quote = quotes.getRandomQuote()
        }
        res.quotes.push(quote)
    }
    return res
}

const processGET_game = () => {
    return quotes.getGame()
}

const processGET_leaderboard = () => {
    const res = {
        leaderboardString: quotes.getLeaderboardString()
    }
    if (typeof res.leaderboardString != 'string') {
        return 404
    }
    res.leaderboardString.replaceAll('\r\n', '<br>')
    return res
}

const processGET_attributions = () => {
    return {
        orderedAuthors: quotes.getAttributions()
    }
}

const processGET_search = query => {
    if (query === undefined || typeof query.str != 'string') {
        return 400
    }
    let searchStr = stripPunctuation(query.str).trim().toLowerCase()
    let allQuotes = quotes.getAllQuotes()
    if (searchStr.length > 0) {
        allQuotes.forEach((x, n) => {
            allQuotes[n].reduced = stripPunctuation(x.quote).trim().toLowerCase()
        })
        allQuotes = allQuotes.filter(x => x.reduced.includes(searchStr))
        allQuotes.forEach((x, n) => {
            delete allQuotes[n].reduced
        })
    }
    let res = {
        numQuotes: allQuotes.length,
        quotes: allQuotes
    }
    return res
}

const processGET_guess = query => {
    if (query === undefined || query.names === undefined) {
        return 400
    }
    let names = query.names.split(',')
    if ( !Array.isArray(names) || names.length < 1) {
        return 400
    }
    let results = {}
    names.forEach(name => {
        results[name] = bestGuess(name)
    })
    return results
}

const processPOST_quote = async body => {
    if (body.quote === undefined || body.authors === undefined) {
        return 400
    }
    let authors = body.authors
    if (Array.isArray(authors)) {
        authors = body.authors.join(',')
    }
    else if (typeof authors != 'string') {
        return 422
    }
    if (typeof body.quote != 'string') {
        return 422
    }
    try {
        await quotes.submitQuote(body.quote, authors)
    } catch (err) {
        console.error(err)
        return 500
    }
    return 201
}

const processPOST_restart = () => {
    setTimeout(() => {
        process.exit()
    }, 1000)
    return 200
}

const processPOST_vote = async (body, perms) => {
    if (body.yesId === undefined || body.noId === undefined) {
        return 400
    }
    if (typeof body.yesId != 'number' || typeof body.noId != 'number') {
        return 422
    }
    let numQuotes = quotes.getAllQuotes().length
    if (yesId < 1 || noId < 1 || yesId > numQuotes || noId > numQuotes) {
        return 400
    }
    if (perms !== LEVEL_ADMIN && perms !== LEVEL_GENERAL) {
        return 500
    }
    try {
        // await quotes.vote(yesId, noId, (perms === LEVEL_ADMIN)) // TODO
    } catch (error) {
        console.error(error)
        return 500
    }
    return 200
}

const httpGETTable = [
    { endpoint: 'quote', perms: LEVEL_GENERAL, fn: () => processGET_quotes() },
    { endpoint: 'quotes', perms: LEVEL_GENERAL, fn: processGET_quotes },
    { endpoint: 'game', perms: LEVEL_GENERAL, fn: processGET_game },
    { endpoint: 'leaderboard', perms: LEVEL_GENERAL, fn: processGET_leaderboard },
    { endpoint: 'attributions', perms: LEVEL_GENERAL, fn: processGET_attributions },
    { endpoint: 'guess', perms: LEVEL_ADMIN, fn: processGET_guess },
    { endpoint: 'search', perms: LEVEL_GENERAL, fn: processGET_search }
]

const httpPOSTTable = [
    { endpoint: 'quote', perms: LEVEL_ADMIN, fn: processPOST_quote },
    { endpoint: 'restart', perms: LEVEL_ADMIN, fn: processPOST_restart },
    { endpoint: 'vote', perms: LEVEL_GENERAL, fn: processPOST_vote }
]

httpGETTable.forEach(item => {
    app.get(`/${item.endpoint}`, async (request, response) => {
        console.log(`GET ${request.url}`)
        const perms = checkPerms(request, item.perms)
        if (perms !== 200) {
            console.error(`\tReturn status code (Bad Auth): ${perms}`)
            return response.status(perms).json({})
        }
        const res = await item.fn(request.query, request.url)
        if (typeof res == 'object') {
            response.send(res)
        }
        else {
            console.error(`\tReturn status code: ${ret}`)
            return response.status(res).json({})
        }
    })
})

httpPOSTTable.forEach(item => {
    app.post(`/${item.endpoint}`, jsonParser, async (request, response) => {
        console.log(`POST ${request.url}\r\n${JSON.stringify(request.body)}`)
        const perms = checkPerms(request, item.perms)
        if (perms !== 200) {
            console.error(`\tReturn status code (Bad Auth): ${perms}`)
            return response.status(perms).json({})
        }
        const res = await item.fn(request.body, perms, request.query, request.url)
        if (Math.floor(res / 100) != 2) {
            console.error(`\tReturn status code: ${perms}`)
        }
        return response.status(res).json({})
    })
})
