const fs = require("fs")
const path = require("path")
const { copyObject } = require("logic-kit")
const logger = require("@adamseidman/logger")
const { createClient } = require("@supabase/supabase-js")

const REFRESH_MINUTES = 10
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLIC_KEY
const allTables = []

let client = createClient(process.env.SUPABASE_URL, key)
if (!client) {
    logger.fatal('Could not create database!', process.env.SUPABASE_URL)
    throw new Error()
}

class Table {
    #data = []

    constructor(tableName, callback) {
        this.name = tableName
        this.client = client
        this.#init(callback)
        allTables.push(this)
    }
    
    async #init(callback) {
        const { error, data } = await this.client.from(this.name).select()
        if (error) {
            logger.error(`Error initializing ${this.name}`, error)
            throw new Error(error)
        }
        this.#data = data
        if (typeof callback === 'function') {
            callback(this)
        }
    }

    async refresh() {
        const { data, error } = await this.client.from(this.name).select()
        if (error) {
            logger.error(`Error refreshing ${this.name}`, error)
        } else if (data) {
            this.#data = data
        }
    }

    get data() {
        return copyObject(this.#data)
    }
}

const refreshFns = []
let refreshIdx = 0

function init() {
    if (!client) return
    fs.readdirSync(path.join(__dirname, 'tables')).forEach((file) => {
        if (path.extname(file) === '.js') {
            const tableName = file.slice(0, file.indexOf('.'))
            const table = require(`./tables/${tableName}`)
            if (!table) {
                logger.error(`Could not load table: ${tableName}`, table)
                return
            }
            if (typeof table.refresh === 'function') {
                refreshFns.push(table.refresh)
            }
        }
    })
    logger.info('Database client loaded.')
}

setInterval(() => {
    if (refreshFns.length < 1) return
    try {
        refreshFns[refreshIdx]()
    } catch (error) {
        logger.error(`Error refreshing db function ${refreshIdx}.`, error)
    }
    refreshIdx = (refreshIdx + 1) % refreshFns.length
}, (REFRESH_MINUTES * 1000 * 60))

function forceRefresh() {
    refreshFns.forEach((fn, idx) => {
        try {
            fn()
        } catch (error) {
            logger.error(`Error forcing db refresh of index ${idx}`, error)
        }
    })
    logger.debug('Full refresh complete.')
}

module.exports = {
    init,
    Table,
    forceRefresh
}
