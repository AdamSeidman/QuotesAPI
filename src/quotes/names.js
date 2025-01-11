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

const allGuesses = (name) => {
    let results = []
    if (Array.isArray(name)) {
        name = name[0]
    }
    if (typeof name != 'string') {
        return results
    }
    let initGuess = bestGuess(name)
    if (Array.isArray(initGuess)) {
        initGuess = initGuess[0]
    }
    results.push(initGuess)
    let rawName = stripPunctuation(name.toLowerCase()).trim().replaceAll(' ', '')
    if (rawName.length < 1) {
        if (!results.includes(pseudoMap.default)) {
            results.push(pseudoMap.default)
        }
        return results
    }
    Object.keys(pseudoMap).forEach(key => {
        if (!results.includes(pseudoMap[key])) {
            let value = stripPunctuation(pseudoMap[key].toLowerCase()).trim().replaceAll(' ', '')
            let keyCopy = stripPunctuation(key.toLowerCase()).trim().replaceAll(' ', '')
            if (rawName.includes(keyCopy) || rawName.includes(value) || value.includes(rawName) || keyCopy.includes(rawName)) {
                results.push(pseudoMap[key])
            }
        }
    })
    if (!results.includes(pseudoMap.default)) {
        results.push(pseudoMap.default)
    }
    return results
}

module.exports = {
    bestGuess,
    allGuesses
}
