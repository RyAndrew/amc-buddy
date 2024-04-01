'use strict';

require('dotenv').config()

const path = require('path')
const fs = require('node:fs/promises')

const dataModel  = require( './lib/dataModel.js')
const db = new dataModel()

const sharp = require('sharp')

const { slowDown } = require('express-slow-down')
const express = require('express')
const hbs = require('hbs')

const imapAttachmentFetcher = require("./lib/imapAttachmentFetcher.js")
const Utils = require("./lib/Utils.js")

const photoDirName = 'photo'
const photoDir = path.join(__dirname,photoDirName)

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
//limiter, 
app.use('/'+photoDirName+thumbDir+'/:thumbname', async (req, res, next) => {
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
    
    //get latest event from db
    let lastEvent = await db.getMaxEventDate()
    
    console.log(lastEvent)
    if(lastEvent.maxDate === null){
        lastEvent = 'Never'
    }else{
        const lastEventDate = new Date(lastEvent.maxDate)
        lastEvent = lastEventDate.toLocaleString('en-US')
    }

    res.render('index', {lastEvent:lastEvent})
})

app.get('/emails_mark_all_unseen', async (req, res) => {
    console.log('mark all unseen')

    res.send(`function disabled`)
    return
    
    await imapAttachmentFetcher.markAllMessagesUnseen()

    res.send(`Done!`)
})

let singleRunActive_FetchImap = false

app.get('/fetch_new_emails', async (req, res) => {
    if(singleRunActive_FetchImap===true ){
        res.send(`No Simultaenous Requests!`)
        return
    }
    singleRunActive_FetchImap = true
    try{
        await imapAttachmentFetcher.saveUnseenEventsToDbDownloadAttachments({db, photoDir})
    }catch(err){
        res.send(`Error! ${err}`)
        console.log(err)
        return
    }finally{
        singleRunActive_FetchImap = false
    }
    res.send(`Done!`)
})

app.get('/fetch_all_emails', async (req, res) => {
    console.log('fetching all emails')

    res.send(`function disabled`)
    return

    try{
        await imapAttachmentFetcher.saveAllEventsToDbDownloadAttachments({db, photoDir})
    }catch(err){
        console.log('error!', err)
    }

    res.send(`Done!`)
})

app.get('/ai_events', async (req, res) => {

    const allEventsAttachments = await db.getAllEventsAndAttachments()
    
    let eventsById = {}
    let lastEvent

    allEventsAttachments.forEach(event => {
        //console.log(event)
        if(event.eventid !== lastEvent){
            eventsById[event.eventid]={
                type: Utils.formatEventType(event.type),
                camera: Utils.formatCamera(event.camera),
                datetime: event.datetime,
                niceDate: Utils.formatDateYmd(event.datetime),
                niceTime: Utils.formatDateHms(event.datetime),
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
    console.log('unhandledRejection')
    console.log(reason)
    throw reason
})

process.on('uncaughtException', (error) => {
    console.log('uncaughtException')
    console.log(error)
    process.exit(1)
})