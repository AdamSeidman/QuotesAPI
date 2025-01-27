const { backup } = require('./backup')
const sqlite3 = require('sqlite3').verbose()
const { copyObject, randomArrayItem, stripPunctuation } = require('poop-sock')

var allQuotes = []

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

const loadQuotes = async () => {
    const loadedText = (allQuotes.length > 0)? 'Re-loaded' : 'Loaded'
    allQuotes = await getAllQuotes()
    console.log(`${loadedText} ${allQuotes.length} quotes.`)
    backup()
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
    getWordMap
}
