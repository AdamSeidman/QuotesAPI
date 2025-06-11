const { postpone } = require("logic-kit")

const app = () => {
    require("dotenv").config()
    process.DEBUG = process.argv.slice(2).includes('--DEBUG')
    console.log('DEBUG =', process.DEBUG)
    require("@adamseidman/logger").init('Quotes List', 'quotes_')
    const db = require("./quote/database")
    db.init()
    require("./quote/quotes")
    postpone(() => { require("./web/server") })
}

if (require.main === module) {
    try {
        app()
    } catch (error) {
        console.error('Error initializing quotes list!', error)
        process.exit(1)
    }
}

module.exports = { app }
