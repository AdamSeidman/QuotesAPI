const { backup } = require('./backup')
const sqlite3 = require('sqlite3').verbose()
const { getDefaultName, bestGuess } = require('./names')
const { copyObject, randomArrayItem, stripPunctuation } = require('poop-sock')

var allQuotes = []
var stats = {}

const getDB = () => {
    return new sqlite3.Database(`${__dirname}\\..\\db\\quotes.db`)
}

const getAllQuotes = () => {
    let db = getDB()
    const close = db => {
        if (db) db.close()
    }
    let quotes = []
    return new Promise((resolve, reject) => {
        db.each(`SELECT * FROM Quotes`, (err, row) => {
            if (err) {
                close(db)
                delete db
                reject(err)
            } else {
                let obj = copyObject(row)
                obj.isGroup = (row.isGroup !== 0)
                quotes.push(obj)
            }
        }, () => {
            close(db)
            delete db
            resolve(quotes)
        })
    })
}

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

const createStats = () => {
    if (allQuotes.length < 1) {
        console.error('Error: Tried to call createStats to early!')
        return
    }
    let quotes = copyObject(allQuotes)
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

const loadQuotes = async () => {
    const loadedText = (allQuotes.length > 0)? 'Re-loaded' : 'Loaded'
    allQuotes = await getAllQuotes()
    console.log(`${loadedText} ${allQuotes.length} quotes.`)
    backup()
    createStats()
}

const getAttributions = () => {
    if (allQuotes.length <= 0) {
        loadQuotes()
    }
    let quotes = copyObject(allQuotes)
    quotes.sort((a, b) => a.id - b.id)
    return quotes.map(x => x.authors.split(','))
}

const getLeaderboardString = () => {
    if (allQuotes.length <= 0) {
        loadQuotes()
    }
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
    allQuotes.forEach(quote => {
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
    if (allQuotes.length <= 0) {
        loadQuotes()
    }
    return copyObject(randomArrayItem(allQuotes))
}

const getGame = () => {
    if (allQuotes.length <= 0) {
        loadQuotes()
    }
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
    const newQuote = {
        quote,
        authors,
        elo: 2000,
        numVotes: 0,
        isGroup: authors.includes(','),
        id: allQuotes.length + 1
    }
    let db = getDB()
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO Quotes (quote, elo, numVotes, isGroup, authors, id) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                newQuote.quote,
                2000, 0,
                (newQuote.isGroup? 1 : 0),
                authors,
                newQuote.id
            ], err => {
                if (db) {
                    db.close()
                    delete db
                }
                if (err) {
                    reject(err)
                } else {
                    backup(`Quote ${newQuote.id} Added`)
                    allQuotes.push(newQuote)
                    console.log(`\tNew Quote Added! (#${newQuote.id})`)
                    resolve(newQuote)
                    createStats()
                }
            })
    })
}

const editQuote = (id, quote) => {
    let db = getDB()
    return new Promise((resolve, reject) => {
        db.run(`UPDATE Quotes SET quote = ? WHERE id=${id}`, [
            quote
        ], err => {
            db.close()
            delete db
            if (err) {
                reject(error)
            }
            else {
                allQuotes.find(x => x.id === id).quote = quote
                backup(`Quote ${id} Edited`)
                resolve()
                createStats()
            }
        })
    })
}

const eloKVal = 32

const vote = (yesId, noId, isElevated) => {
    if (allQuotes.length <= 0) {
        loadQuotes()
    }
    let yesQuote = allQuotes.find(x => x.id === yesId)
    let noQuote = allQuotes.find(x => x.id === noId)
    let db = getDB()
    return new Promise((resolve, reject) => {
        if (yesQuote === undefined || noQuote === undefined || typeof isElevated != 'boolean') {
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

        let error = undefined
        db.run(`UPDATE Quotes SET elo = ?, numVotes = ? WHERE id=${yesQuote.id}`, [
            yesQuote.elo, yesQuote.numVotes
        ], err => {
            if (err) {
                error = err
                db.close()
                delete db
            }
        })
        if (error) {
            reject(error)
            return
        }
        db.run(`UPDATE Quotes SET elo = ?, numVotes = ? WHERE id=${noQuote.id}`, [
            noQuote.elo, noQuote.numVotes
        ], err => {
            db.close()
            delete db
            if (err) {
                reject(err)
            }
            else {
                resolve()
            }
        })
    })
}

const getWordMap = () => {
    if (allQuotes.length <= 0) {
        loadQuotes()
    }
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
    loadQuotes,
    getRandomQuote,
    getGame,
    getLeaderboardString,
    getAttributions,
    getAllQuotes: () => {
        if (allQuotes.length <= 0) {
            loadQuotes()
        }
        return copyObject(allQuotes)
    },
    submitQuote,
    editQuote,
    vote,
    getWordMap,
    getStats: () => {
        return copyObject(stats)
    }
}
