const { backup } = require("./backup")
const { getDefaultName, bestGuess } = require("./names")
const { copyObject, randomArrayItem, stripPunctuation } = require("logic-kit") // TODO DB
const db = require("./tables/quotesDb")

const eloKVal = 100
let stats = {}

const getInternalNameGuesses = (arr) => {
    let results = {}
    arr.forEach(name => {
        let guess = bestGuess(name)
        if (Array.isArray(guess)) {
            results[name] = getDefaultName()
        } else {
            results[name] = guess
        }
    })
    return results
}

const recreateStats = () => {
    stats = {}
    let quotes = db.get()
    if (quotes.length < 1) {
        console.error('Error: Tried to call createStats to early!')
        return
    }
    let peopleMap = {}
    let sentences = []
    quotes.sort((a, b) => a.id - b.id)
    quotes.forEach(quote => {
        let authors = quote.authors
        if (quote.isGroup) {
            authors = authors.split(',').map(x => x.trim())
        } else {
            authors = [authors.trim()]
        }
        authors.forEach(author => {
            if (peopleMap[author] === undefined) {
                peopleMap[author] = {
                    highestRankedQuote: { elo: -1 },
                    lowestRankedQuote: { elo: 9999999 },
                    highestLeaderboardPosition: quotes.length + 1,
                    currentLeaderboardPosition: quotes.length + 1,
                    numSolo: 0,
                    numQuotes: 0,
                    numGroup: 0,
                    teamups: {},
                    wordsSpoken: {},
                    firstQuoteId: quotes.length + 1,
                    lastQuoteId: -1,
                    sentences: [],
                    totalElo: 0,
                    name: author
                }
            }
        })
    })
    let leaderboard = []
    let leaderboardMap = {}
    quotes.forEach(quote => {
        let authors = quote.authors
        if (quote.isGroup) {
            authors = authors.split(',').map(x => x.trim())
        } else {
            authors = [authors.trim()]
        }
        authors.forEach(author => {
            if (!leaderboard.includes(author)) {
                leaderboard.push(author)
                leaderboardMap[author] = {
                    numQuotes: 1,
                    numSolo: quote.isGroup? 0 : 1,
                    numGroup: quote.isGroup? 1 : 0
                }
            } else {
                leaderboardMap[author].numQuotes += 1
                if (quote.isGroup) {
                    leaderboardMap[author].numGroup += 1
                } else {
                    leaderboardMap[author].numSolo += 1
                }
            }
            peopleMap[author].totalElo += quote.elo
            peopleMap[author].firstQuoteId = Math.min(quote.id, peopleMap[author].firstQuoteId)
            peopleMap[author].lastQuoteId = Math.max(quote.id, peopleMap[author].lastQuoteId)
            peopleMap[author].numQuotes += 1
            if (quote.isGroup) {
                peopleMap[author].numGroup += 1
                authors.forEach(teamup => {
                    if (peopleMap[author].teamups[teamup] === undefined) {
                        peopleMap[author].teamups[teamup] = 1
                    } else {
                        peopleMap[author].teamups[teamup] += 1
                    }
                })
            } else {
                peopleMap[author].numSolo += 1
            }
            if (peopleMap[author].highestRankedQuote.elo < quote.elo) {
                peopleMap[author].highestRankedQuote = copyObject(quote)
            }
            if (peopleMap[author].lowestRankedQuote.elo > quote.elo) {
                peopleMap[author].lowestRankedQuote = copyObject(quote)
            }
        })
        leaderboard.sort((a, b) => {
            if (leaderboardMap[a].numQuotes === leaderboardMap[b].numQuotes) {
                return leaderboardMap[b].numSolo - leaderboardMap[a].numSolo
            }
            return leaderboardMap[b].numQuotes - leaderboardMap[a].numQuotes
        })
        leaderboard.forEach((x, n) => {
            peopleMap[x].highestLeaderboardPosition = Math.min(peopleMap[x].highestLeaderboardPosition, (n + 1))
        })
        if (quote.isGroup) {
            let lines = quote.quote.split('\n').map(x => x.trim())
            lines.forEach(x => {
                sentences.push({
                    sentence: x,
                    quote: copyObject(quote),
                    whoSaidIt: ''
                })
            })
        } else {
            let text = quote.quote.trim()
            if (text.includes('\n')) {
                text = text.split('\n').map(x => x.trim()).join(' ')
            }
            sentences.push({
                sentence: text,
                quote: copyObject(quote),
                whoSaidIt: quote.authors
            })
        }
    })
    leaderboard.forEach((x, n) => {
        peopleMap[x].currentLeaderboardPosition = (n + 1)
    })
    let unknownList = []
    sentences.forEach(sentence => {
        let quoteText = sentence.sentence.trim()

        if (quoteText.includes('~')) {
            quoteText = quoteText.slice(0, quoteText.indexOf('~')).trim()
        } else if (quoteText.includes('-')) {
            quoteText = quoteText.slice(0, quoteText.indexOf('-')).trim()
        } else if (quoteText.includes(':')) {
            quoteText = quoteText.slice(quoteText.indexOf(':') + 1).trim()
        }
        quoteText = quoteText
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[^a-zA-Z0-9 ']/g, '')
            .toLowerCase()
            .trim()
        sentence.quoteText = quoteText

        if (sentence.whoSaidIt.length < 1) {
            let person = ''
            if (sentence.sentence.includes(':')) {
                person = sentence.sentence.slice(0, sentence.sentence.indexOf(':')).trim().toLowerCase()
            } else if (sentence.sentence.includes('~')) {
                person = sentence.sentence.slice(sentence.sentence.indexOf('~') + 1).trim().toLowerCase()
            }
            person = person.replace(/\(.*?\)/g, '').trim()
            sentence.examples = []
            person.split(' and ').map(x => x.trim()).forEach(x => {
                sentence.examples.push(x)
                if (x.length > 0 && !unknownList.includes(x)) {
                    unknownList.push(x)
                }
            })
        }
    })
    let nameResults = copyObject(getInternalNameGuesses(unknownList))
    let extras = []
    sentences.forEach(sentence => {
        if (sentence.whoSaidIt.length < 1) {
            if (sentence.examples.length > 1) {
                extras.push(copyObject(sentence))
                extras[extras.length - 1].examples = [sentence.examples.pop()]
            }
        }
    })
    extras.forEach(x => {
        sentences.push(x)
    })
    sentences.forEach(sentence => {
        if (sentence.whoSaidIt.length < 1) {
            sentence.whoSaidIt = nameResults[sentence.examples[0]]
            if (!sentence.quote.authors.includes(sentence.whoSaidIt)) {
                sentence.whoSaidIt = getDefaultName()
            }
        }
    })
    sentences.forEach(sentence => {
        sentence.quoteText.split(' ').forEach(word => {
            if (word.length > 0 && peopleMap[sentence.whoSaidIt] !== undefined) {
                if (peopleMap[sentence.whoSaidIt].wordsSpoken[word] === undefined) {
                    peopleMap[sentence.whoSaidIt].wordsSpoken[word] = 1
                } else {
                    peopleMap[sentence.whoSaidIt].wordsSpoken[word] += 1
                }
            }
        })
        peopleMap[sentence.whoSaidIt].sentences.push(sentence.sentence)
    })
    stats = copyObject(peopleMap)
}

const getStats = () => {
    return stats
}

const getAttributions = () => {
    let quotes = db.get()
    quotes.sort((a, b) => a.id - b.id)
    return quotes.map(x => x.authors.split(','))
}

const getLeaderboardString = () => {
    const peopleMap = {}
    const tally = (author, isGroup) => {
        if (peopleMap[author] === undefined) {
            peopleMap[author] = {
                numQuotes: 0,
                groupQuotes: 0,
                soloQuotes: 0
            }
        }
        peopleMap[author].numQuotes += 1
        if (isGroup) {
            peopleMap[author].groupQuotes += 1
        } else {
            peopleMap[author].soloQuotes += 1
        }
    }
    db.get().forEach((quote) => {
        if (quote.isGroup) {
            let authors = quote.authors.split(',')
            authors.forEach(x => tally(x, true))
        } else {
            tally(quote.authors, false)
        }
    })
    let leaderboard = Object.keys(peopleMap)
    leaderboard.sort((a, b) => {
        if (peopleMap[a].numQuotes !== peopleMap[b].numQuotes) {
            return (peopleMap[b].numQuotes - peopleMap[a].numQuotes)
        }
        return (peopleMap[a].groupQuotes - peopleMap[b].groupQuotes)
    })
    let leaderboardString = ''
    leaderboard.forEach((x, n) => {
        if (n > 0) {
            leaderboardString += '\r\n'
        }
        leaderboardString = `${leaderboardString}${n + 1}. ${x} (${peopleMap[x].numQuotes} quotes, ${peopleMap[x].soloQuotes} solo)`
    })
    return leaderboardString
}

const getRandomQuote = () => {
    return copyObject(randomArrayItem(db.get()))
}

const getGame = () => {
    const game = {
        options: [],
        quote: {
            isGroup: true
        }
    }
    while (game.quote.isGroup) {
        game.quote = getRandomQuote()
    }
    game.options.push(game.quote.authors)
    let text = game.quote.quote
    if (text.includes('~')) {
        game.quote.quote = text.slice(0, text.lastIndexOf('~'))
    }
    else {
        game.quote.quote = text.slice(0, text.lastIndexOf('-'))
    }

    while (game.options.length < 5) {
        let quote = getRandomQuote()
        if (!quote.isGroup && !game.options.includes(quote.authors)) {
            game.options.push(quote.authors)
        }
    }
    return game
}

const submitQuote = (quote, authors) => {
    return db.submit(quote, authors)
}

const editQuote = (id, quote) => {
    return db.editQuote(id, quote)
}


const vote = (yesId, noId) => {
    let allQuotes = db.get()
    let yesQuote = allQuotes.find(x => x.id === yesId)
    let noQuote = allQuotes.find(x => x.id === noId)
    let db = getDB()
    return new Promise((resolve, reject) => {
        if (yesQuote === undefined || noQuote === undefined) {
            reject('Could not decipher information.')
            return
        }
        yesQuote.numVotes += 1
        noQuote.numVotes += 1
        let loser = noQuote.elo
        let winner = yesQuote.elo
        yesQuote.elo += Math.round(eloKVal * (1 - (1 / (1 + Math.pow(10, (loser - winner) / 400)))))
        noQuote.elo += Math.round(eloKVal * (0 - (1 / (1 + Math.pow(10, (winner - loser) / 400)))))
        if (noQuote.elo < 100) {
            noQuote.elo = 100
        }

        db.setElo(yesQuote.numVotes, yesQuote.elo, yesQuote.id)
            .then(() => {
                return db.setElo(noQuote.numVotes, noQuote.elo, noQuote.id)
            })
            .then(() => {
                resolve()
            })
            .catch((error) => {
                reject(error)
            })
    })
}

const getWordMap = () => {
    let allQuotes = db.get()
    let wordMap = {}
    allQuotes.forEach(quote => {
        let text = quote.quote.split('\n')
        if (!Array.isArray(text)) {
            text = [text]
        }
        text.forEach(x => {
            x = x.trim()
            if (quote.isGroup) {
                x = x.slice(x.indexOf(':') + 1)
            } else if (x.includes('~')) {
                x = x.slice(0, x.indexOf('~'))
            } else {
                x = x.slice(0, x.indexOf('-'))
            }
            x = x.replaceAll('"', ' ')
            x = x.replaceAll('?', ' ')
            x = x.replaceAll("'", '')
            x = x.replaceAll(/[^\x20-\x7E]/g, '');
            x = x.replaceAll(/\s*\(.*?\)\s*/g, ' ')
            x = x.replaceAll(/\s*\*.*?\*\s*/g, ' ')
            x = stripPunctuation(x).trim().toLowerCase()
            x.split(' ').forEach(word => {
                word = word.trim()
                word = word.slice(0, 1).toUpperCase() + word.slice(1)
                if (word.length > 0) {
                    if (wordMap[word] === undefined) {
                        wordMap[word] = 1
                    } else {
                        wordMap[word] += 1
                    }
                }
            })
        })
    })
    return wordMap
}

module.exports = {
    getRandomQuote,
    getGame,
    getLeaderboardString,
    getAttributions,
    getAllQuotes: () => db.get(),
    submitQuote,
    editQuote,
    vote,
    getWordMap,
    getStats,
    recreateStats
}
