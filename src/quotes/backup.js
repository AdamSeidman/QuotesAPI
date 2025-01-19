const fs = require('fs')
const config = require('../config')
const sgMail = require('@sendgrid/mail')

if (config.sendGrid !== undefined && typeof config.sendGrid.apiKey == 'string') {
    sgMail.setApiKey(config.sendGrid.apiKey)

    const scheduleBackup = () => {
        setTimeout(() => {
            backup('Daily Backup')
            scheduleBackup()
        }, (1000 * 60 * 60 * 24))
    }
    scheduleBackup()
}
else {
    console.log('Will not be backing up!')
}

const backup = (subject) => {
    if (config.sendGrid === undefined) {
        return
    }
    if (config.sendGrid.sendConfig || config.sendGrid.sendPseudos || config.sendGrid.sendDb) {
        const msg = {
            to: config.sendGrid.email,
            from: config.sendGrid.email,
            subject: `Quote Backup (${subject || 'General'})`,
            text: 'Quote Backup',
            html: '<strong>Please see attached!</strong>',
            attachments: []
        }
        if (config.sendGrid.sendDb) {
            msg.attachments.push({
                content: fs.readFileSync(`${__dirname}/../db/quotes.db`).toString('base64'),
                filename: 'quotes.db',
                type: 'application/octet-stream',
                disposition: 'attachment'
            })
        }
        if (config.sendGrid.sendPseudos) {
            msg.attachments.push({
                content: fs.readFileSync(`${__dirname}/pseudonyms.json`).toString('base64'),
                filename: 'pseudonyms.json',
                type: 'application/json',
                disposition: 'attachment'
            })
        }
        if (config.sendGrid.sendConfig) {
            msg.attachments.push({
                content: fs.readFileSync(`${__dirname}/../config.json`).toString('base64'),
                filename: 'config.json',
                type: 'application/json',
                disposition: 'attachment'
            })
        }
        sgMail.send(msg)
            .catch(err => {
                console.error('Error sending mail!', err)
            })
    }
}

module.exports = {
    backup
}
