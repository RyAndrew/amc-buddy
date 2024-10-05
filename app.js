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
const handlebars = new hbs.create()

const Joi = require('joi')

const imapAttachmentFetcher = require("./lib/imapAttachmentFetcher.js")
const Utils = require("./lib/Utils.js")

const photoDirName = 'photo'
const photoDir = path.join(__dirname,photoDirName)

const app = express()
const port = process.env.PORT || 8080

const jsonBodyPayload = express.json()

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
app.use('/favicon.ico',express.static(path.join(__dirname,'static','favicon.ico')))
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
        lastEvent = lastEventDate.toLocaleString('en-CA')
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
    let messagesDownloaded = 0;
    try{
        messagesDownloaded = await imapAttachmentFetcher.saveUnseenEventsToDbDownloadAttachments({db, photoDir})
    }catch(err){
        res.send(`Error! ${err}`)
        console.log(err)
        return
    }finally{
        singleRunActive_FetchImap = false
    }
    res.send(`Done! ${messagesDownloaded} new messages`)
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

app.get('/api/events', async (req, res) => {

    const dateStart = req.query?.dateStart
    if(!dateStart){
        res.send( 'missing dateStart parameter' )
        return
    }

    const dateEnd = req.query?.dateEnd
    if(!dateEnd){
        res.send( 'missing dateEnd parameter' )
        return
    }

    const after = req.query?.after
    if(!after){
        res.send( 'missing after parameter' )
        return
    }
    
    // const dateStart = req.query?.dateStart
    // if(!dateStart){
    //     res.send( 'missing dateStart parameter' )
    //     return
    // }
    const allEventsAttachments = await db.queryEventsAndAttachmentsOffset(after, dateStart, dateEnd)
    console.log('allEventsAttachments.length',allEventsAttachments.length)
    
    let eventsById = {}
    //let lastEvent

    allEventsAttachments.forEach(event => {
        //console.log(event)
        if(!eventsById[event.eventid]){
            eventsById[event.eventid]={
                eventid: event.eventid,
                favorite: event.favorite,
                type: Utils.formatEventType(event.type),
                camera: Utils.formatCamera(event.camera),
                datetime: event.datetime,
                niceDate: Utils.formatDateYmd(event.datetime),
                niceTime: Utils.formatDateHms(event.datetime),
                text: event.text,
                attachments: [],
            }
            //lastEvent = event.eventid
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

    let highQuality = (req.query?.quality === 'low' ? false : true)
    //const carousel = 
    //console.log('carousel',carousel)
    const template = handlebars.compile(await fs.readFile("views/partials/event_carousel.hbs","utf8"))
    
    //console.log()

    res.send( JSON.stringify({
        count:allEventsAttachments.length,
        events,
        html:template({events, highQuality})
    }))

    // res.render("partials/event_carousel.hbs",(err, renderedHtml) => {
    //     if(err) {
    //         console.log('error',err)
    //         return
    //     }
    //     console.log(arguments)
    //     console.log(renderedHtml)
    // })
})

const putFavoriteSchema = Joi.object({
    eventId: Joi.number().integer().positive(),
    favorite: Joi.number().integer().min(0).max(1),
})

app.put('/favorite', jsonBodyPayload, Utils.joiValidatorMiddleware(putFavoriteSchema), async (req, res) => {

    console.log('req.body',req.body)
    console.log('req.body.eventId',req.body.eventId)
    console.log('req.body.favorite',req.body.favorite)


    //const { error, value } = putFavoriteSchema.validate(req.body);

    // if(error){
    //     res.status(400).send('invalid input')
    //     console.log('invalid input')
    //     return
    // }

    await db.updateEventFavorite(req.body.eventId, req.body.favorite)
    
    res.send()
})
app.get('/events', async (req, res) => {

    const after = req.query?.after || null

    const allEventsAttachments = await db.queryEventsAndAttachmentsOffset(after)
    
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

    let highQuality = (req.query?.quality === 'low' ? false : true)

    //console.log(req.query)
    //console.log('highQuality',highQuality)

    let dateStart = req.query?.dateStart
    if(!dateStart){
        dateStart = new Date(Date.now() - 86400000)
    }
    let dateEnd = req.query?.dateEnd
    if(!dateEnd){
        dateEnd = new Date()
    }
    //console.log('datestart',datestart,'dateend',dateend)
    
    res.render('events',{highQuality, events, dateStart, dateEnd})
})


function errorHandler (err, req, res, next) {
    if(err){
        console.log('error Handler!')
        console.log(err)
        res.status(500)
        res.send('Server Error')
        return
    }
    next()
}
app.use(errorHandler)

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