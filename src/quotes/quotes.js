const { backup } = require('./backup')
const sqlite3 = require('sqlite3').verbose()
const { copyObject, randomArrayItem } = require('poop-sock')

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
    return copyObject(allQuotes).map(x => x.authors.split(','))
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
        adminYesCount: 0,
        adminNoCount: 0,
        generalYesCount: 0,
        generalNoCount: 0,
        isGroup: authors.includes(','),
        id: allQuotes.length + 1
    }
    let db = getDB()
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO Quotes (quote, adminYesCount, adminNoCount, generalYesCount, generalNoCount, isGroup, authors, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newQuote.quote,
                0, 0, 0, 0,
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

const editQuote = (id, quote, authors) => {
    let db = getDB()
    return new Promise((resolve, reject) => {
        db.run(`UPDATE Quotes SET quote = ?, authors = ?, isGroup = ? WHERE id=${id}`, [
            quote, authors, (authors.includes(','))? 1 : 0
        ], err => {
            db.close()
            delete db
            if (err) {
                reject(error)
            }
            else {
                let q = allQuotes.find(x => x.id === id)
                q.quote = quote
                q.authors = authors
                backup(`Quote ${id} Edited`)
                resolve()
            }
        })
    })
}

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
        if (isElevated) {
            yesQuote.adminYesCount += 1
            noQuote.adminNoCount += 1
        } else {
            yesQuote.generalYesCount += 1
            noQuote.generalNoCount += 1
        }

        let error = undefined
        db.run(`UPDATE Quotes SET adminYesCount = ?, adminNoCount = ?, generalYesCount = ?, generalNoCount = ? WHERE id=${yesQuote.id}`, [
            yesQuote.adminYesCount, yesQuote.adminNoCount, yesQuote.generalYesCount, yesQuote.generalNoCount
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
        db.run(`UPDATE Quotes SET adminYesCount = ?, adminNoCount = ?, generalYesCount = ?, generalNoCount = ? WHERE id=${noQuote.id}`, [
            noQuote.adminYesCount, noQuote.adminNoCount, noQuote.generalYesCount, noQuote.generalNoCount
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
    vote
}
