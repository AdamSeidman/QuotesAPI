const fs = require('fs')
const cors = require('cors')
const path = require('path')
const config = require('./config')
const express = require('express')
const bodyParser = require('body-parser')
const quotes = require('./quotes/quotes')
const { stripPunctuation } = require('poop-sock')
const { bestGuess, allGuesses } = require('./quotes/names')

quotes.loadQuotes()

var app = express()
app.use(cors())

var options = {}
var jsonParser = bodyParser.json()

if (config.cert !== undefined) {
    Object.keys(config.cert).forEach(x => {
        if (Array.isArray(config.cert[x])) {
            options[x] = []
            config.cert[x].forEach(file => {
                options[x].push(fs.readFileSync(__dirname + file, 'utf8'))
            })
        } else {
            options[x] = fs.readFileSync(__dirname + config.cert[x], 'utf8')
        }
    })
    require('https').createServer(options, app).listen(config.port, '0.0.0.0', () => {
        console.log(`HTTPS express server listening on port ${config.port}`)
    })
}
else {
    app.listen(config.port, () => {
        console.log(`Express server listening on port ${config.port}`)
    })
}

app.get('/', (req, res) => {
    if (config.useStatic) {
        const filePath = path.join(__dirname, 'www/index.html')
        res.sendFile(filePath)
    } else if (config.redirectURL !== undefined) {
        res.redirect(config.redirectURL)
    } else {
        res.status(200).send({
            numQuotes: quotes.getAllQuotes().length
        })
    }
})

if (config.useStatic) {
    app.use(express.static(path.join(__dirname, 'www')))
}

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

const processGET_words = () => {
    return {
        map: quotes.getWordMap()
    }
}

const processGET_all = query => {
    if (query === undefined) {
        return 400
    }
    let results = processGET_search({str: ""})
    if (query.includeStats) {
        results.stats = quotes.getStats()
    }
    return results
}

const processGET_guess = query => {
    if (query === undefined || query.names === undefined) {
        return 400
    }
    let names = query.names.split(',')
    if (!Array.isArray(names) || names.length < 1) {
        return 400
    }
    let results = {}
    if (query.verbose) {
        if (names.length > 1) {
            return 400
        }
        results.best = bestGuess(names[0])
        if (Array.isArray(results.best)) {
            results.best = results.best[0]
        }
        results.allGuesses = allGuesses(names[0])
    }
    else {
        names.forEach(name => {
            results[name] = bestGuess(name)
        })
    }
    return results
}

const processPOST_quote = async (body) => {
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

const processPOST_edit = async (body) => {
    if (body.quote === undefined || body.id === undefined) {
        return 400
    }
    if (typeof body.quote != 'string') {
        return 422
    }
    if (typeof body.id != 'number') {
        try {
            body.id = parseInt(body.id)
        } catch (err) {
            console.error('\tInvalid ID given:', body.id)
        }
        if (typeof body.id != 'number') {
            return 422
        }
    }
    if (body.id < 1 || body.id > (quotes.getAllQuotes().length)) {
        return 400
    }
    try {
        await quotes.editQuote(body.id, body.quote)
    } catch (err) {
        console.error(err)
        return 500
    }
    return 200
}

const processPOST_vote = async (body, isElevated) => {
    if (body.yesId === undefined || body.noId === undefined) {
        return 400
    }
    if (typeof body.yesId != 'number' || typeof body.noId != 'number') {
        return 422
    }
    let numQuotes = quotes.getAllQuotes().length
    if (body.yesId < 1 || body.noId < 1 || body.yesId > numQuotes || body.noId > numQuotes) {
        return 400
    }
    try {
        await quotes.vote(body.yesId, body.noId, isElevated)
    } catch (error) {
        console.error(error)
        return 500
    }
    return 200
}

const httpGETTable = [
    { endpoint: 'guess', perms: LEVEL_ADMIN, fn: processGET_guess },
    { endpoint: 'search', perms: LEVEL_GENERAL, fn: processGET_search },
    { endpoint: 'all', perms: LEVEL_GENERAL, fn: processGET_all, silent: true },
    { endpoint: 'words', perms: LEVEL_GENERAL, fn: processGET_words }
]

const httpPOSTTable = [
    { endpoint: 'quote', perms: LEVEL_ADMIN, fn: processPOST_quote },
    { endpoint: 'vote', perms: LEVEL_GENERAL, fn: processPOST_vote },
    { endpoint: 'edit', perms: LEVEL_ADMIN, fn: processPOST_edit }
]

httpGETTable.forEach(item => {
    app.get(`/api/${item.endpoint}`, async (request, response) => {
        if (item.silent !== true) {
            console.log(`GET ${request.url}`)
        }
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
            if (item.silent) {
                console.log(`GET ${request.url}`)
            }
            console.error(`\tReturn status code: ${res}`)
            return response.status(res).json({})
        }
    })
})

httpPOSTTable.forEach(item => {
    app.post(`/api/${item.endpoint}`, jsonParser, async (request, response) => {
        console.log(`POST ${request.url}\r\n${JSON.stringify(request.body)}`)
        const perms = checkPerms(request, item.perms)
        if (perms !== 200) {
            console.error(`\tReturn status code (Bad Auth): ${perms}`)
            return response.status(perms).json({})
        }
        const res = await item.fn(request.body, (checkPerms(request, LEVEL_ADMIN) === 200), request.query, request.url)
        if (Math.floor(res / 100) != 2) {
            console.error(`\tReturn status code: ${res}`)
        }
        return response.status(res).json({})
    })
})
