const { Table } = require("../database")
const { copyObject, postpone } = require("logic-kit")

let recreateStats = () => {}
postpone(() => {
    recreateStats = require("../quotes").recreateStats
})

const table = new Table('QuotesList', (tbl) => {
    recreateStats()
    console.log(`${tbl.data.length} quotes loaded.`)
})

function get() {
    return table.data.map((quote) => {
        return {
            quote: quote.quote,
            elo: quote.elo,
            isGroup: quote.is_group,
            id: quote.quote_num,
            authors: quote.authors,
            numVotes: quote.num_votes
        }
    })
}

function submit(quote, authors) {
    return new Promise(async (resolve, reject) => {
        let isGroup = false
        if (typeof authors === 'string') {
            isGroup = authors.includes(',')
        } else if (Array.isArray(authors)) {
            if (authors.length === 1) {
                isGroup = false
                authors = authors[0]
            } else {
                isGroup = true
                authors = authors.join(',')
            }
        }
        const obj = {
            is_group: isGroup,
            quote,
            authors,
            quote_num: (table.data.length + 1)
        }
        const { error } = await table.client
            .from(table.name)
            .insert([obj])
        if (error) {
            reject(error)
        } else {
            table.refresh()
            resolve(copyObject(obj))
        }
        recreateStats()
    })
}

function update(quote, quoteNum) {
    return new Promise(async (resolve, reject) => {
        const { error } = await table.client
            .from(table.name)
            .update({ quote })
            .eq('quote_num', quoteNum)
        if (error) {
            reject(error)
        } else {
            table.refresh()
            resolve()
        }
        recreateStats()
    })
}

function setElo(numVotes, elo, quoteNum) {
    return new Promise(async (resolve, reject) => {
        const { error } = await table.client
            .from(table.name)
            .update({
                num_votes: numVotes,
                elo
            })
            .eq('quote_num', quoteNum)
        if (error) {
            reject(error)
        } else {
            table.refresh()
            resolve()
        }
        recreateStats()
    })
}

module.exports = {
    refresh: () => table.refresh(),
    get,
    submit,
    update,
    setElo
}
