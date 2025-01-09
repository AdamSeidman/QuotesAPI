const fs = require('fs')
const quotes = require('./quotes')
const { copyObject, stripPunctuation } = require('poop-sock')

const pseudoMap = {
    default: 'Overheard or Other'
}
var loaded = false

const setupNames = () => {
    loaded = true
    if (fs.existsSync(__dirname + '/pseudonyms.json')) {
        let pseudos = copyObject(require('./pseudonyms'))
        Object.keys(pseudos).forEach(key => {
            if (Array.isArray(pseudos[key])) {
                pseudos[key].forEach(item => {
                    pseudoMap[item] = key
                })
            }
            pseudoMap[key] = key
        })
    }
    quotes.getAttributions().forEach(x => {
        x.forEach(y => {
            let name = stripPunctuation(y.toLowerCase()).trim()
            if (pseudoMap[name] === undefined) {
                pseudoMap[name] = y
            }
        })
    })
}

const bestGuess = (name) => {
    if (!loaded) {
        setupNames()
    }
    let testName = stripPunctuation(name.toLowerCase()).trim()
    if (testName.length < 1) {
        return pseudoMap.default
    }
    if (pseudoMap[testName] !== undefined) {
        return pseudoMap[testName]
    }
    let found = Object.keys(pseudoMap).find(x => x.includes(testName))
    if (found) {
        return pseudoMap[found]
    }
    found = Object.keys(pseudoMap).find(x => testName.includes(x))
    if (found) {
        return pseudoMap[found]
    }
    return [name]
}

module.exports = {
    bestGuess
}
