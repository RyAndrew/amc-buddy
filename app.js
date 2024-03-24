'use strict';

require('dotenv').config()

const path = require('path')
const fs = require('node:fs/promises')

const sqlite3  = require( 'sqlite3')
const { open }  = require( 'sqlite')

const sharp = require('sharp')

const { slowDown } = require('express-slow-down')
const express = require('express')
const hbs = require('hbs')

const imapAttachmentFetcher = require("./lib/imapAttachmentFetcher.js")
const Utils = require("./lib/Utils.js")

const photoDirName = 'photo'
const photoDir = path.join(__dirname,photoDirName)

async function openDb(){
    return await open({
        filename: process.env.SQLLITEDATA,
        driver: sqlite3.Database
    })
}

const app = express()
const port = process.env.PORT || 8080

hbs.registerPartials(path.join(__dirname, 'views', 'partials'))
app.set('view engine', 'hbs')
app.set('views', path.join(__dirname, 'views'))

app.listen(port, () => {
    console.log(`App listening on port ${port}`)
})

const thumbDir = '_thumb'

//slow down thumbnail requests so it doesn't crash node
const limiter = slowDown({
	windowMs: 1000, // 1 second
	delayAfter: 10, // Allow 10 requests per second
	delayMs: (hits) => hits * 75, // Add 50 ms of delay to every request after the 10th one.
})
app.use('/'+photoDirName+thumbDir+'/:thumbname', limiter, async (req, res, next) => {
    //console.log('Requested thumbname:', req.params.thumbname)
    let thumbFile = path.join(photoDir+thumbDir,req.params.thumbname)
    await fs.access(thumbFile)
    //.then(() => {
        //console.log('thumb YES exist')
    //})
    .catch(async () => {
        console.log(`generating thumb ${req.params.thumbname}`)
        let originalFile = path.join(photoDir,req.params.thumbname)
        try{
            await sharp(originalFile,{failOn:'error'}).resize(450, 253).toFile(thumbFile)
        }catch(err){
            console.log('Sharp error', err)
        }
    })
    next()
  })

app.use('/static',express.static(path.join(__dirname,'static')))
app.use('/'+photoDirName+thumbDir,express.static(photoDir+thumbDir))
app.use('/'+photoDirName,express.static(photoDir))

app.get('/', async (req, res) => {
    res.render('index')
})

app.get('/fetch_new_emails', async (req, res) => {
    console.log('fetching events')

    const db = await openDb()
    await imapAttachmentFetcher.saveNewEventsToDbDownloadAttachments({db, photoDir})
    db.close()

    res.send(`Done!`)
})

app.get('/fetch_all_emails', async (req, res) => {
    console.log('fetching events')

    const db = await openDb()
    try{
        await imapAttachmentFetcher.saveAllEventsToDbDownloadAttachments({db, photoDir})
    }catch(err){
        console.log('error!', err)
    }
    db.close()

    res.send(`Done!`)
})

app.get('/ai_events', async (req, res) => {

    const db = await openDb()

    const allEventsAttachments = await db.all(
        `SELECT 
    event.eventid,
    event.datetime,
    event.type,
    event.camera,
    event.text,
    eventattachment.filename 
    FROM 
    event 
    join eventattachment on eventattachment.eventid=event.eventid 
    ORDER BY
    event.eventid ASC`
    )

    db.close()
    
    let eventsById = {}
    let lastEvent

    allEventsAttachments.forEach(event => {
        //console.log(event)
        if(event.eventid !== lastEvent){
            eventsById[event.eventid]={
                type: Utils.formatEventType(event.type),
                camera: Utils.formatCamera(event.camera),
                datetime: event.datetime,
                niceDate: Utils.formatDateYmdHms(event.datetime),
                text: event.text,
                attachments: [],
            }
            lastEvent = event.eventid
        }
        eventsById[event.eventid].attachments.push({
            filename: event.filename,
        })
    })
    let events = Object.values(eventsById)

    events = Utils.sortObjectArray(events, {
        key:'datetime',
        direction:'desc'
    })

    res.render('ai_events',{events:events})
})

process.on('unhandledRejection', (reason) => {
    // I just caught an unhandled promise rejection,
    // since we already have fallback handler for unhandled errors (see below),
    // let throw and let him handle that
    console.log('unhandledRejection')
    console.log(reason)
    throw reason
})

process.on('uncaughtException', (error) => {
    // I just received an error that was never handled, time to handle it and then decide whether a restart is needed

    console.log('uncaughtException')
    console.log(error)

    process.exit(1)
})