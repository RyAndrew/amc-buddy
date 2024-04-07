'use strict';

const Utils = require("./Utils.js")

const fs = require('node:fs/promises')
const { simpleParser } = require("mailparser")
const Imap = require('imap') // install from github! // npm install github:mscdex/node-imap

let imap= new Imap({
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_SERVER,
    port: process.env.IMAP_PORT,
    tls: true,
})

async function fetchMessagesById(messages, config){
    return new Promise(async (resolve, reject) => {
        const messagesCount = messages.length
        let messagesProcessed = 0

        const fetch = imap.seq.fetch(messages, {
            //bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
            bodies:'',
            struct: true,
            markSeen: true,
        })
        console.log('fetch return',fetch)
        fetch.on('message', function(msg, seqno) {
            console.log('#%d Message', seqno)
            msg.on('body', async function(stream, info) {
                let email
                try{
                    email = await simpleParser(stream)
                }catch(err){
                    console.log('error parsing!', err)
                    reject(err)
                }
                await saveEmailToDatabase(email, config)
                await saveAllEmailAttachments(email, config)
                messagesProcessed++
                if(messagesProcessed >= messagesCount){
                    console.log('last message processed - resolve')
                    resolve()
                }
            })
            msg.on('end', function() {
                console.log('#%d Msg End', seqno)
            })
        })
        fetch.once('error', function(err) {
            console.log('Fetch error: ' + err)
            throw err
        })
        fetch.once('end', function() {
            console.log('Done fetching all messages!')
            imap.end()
        })
    })
}

function downloadUnseenMessages(config){
    return new Promise(async (resolve, reject) => {
        //,['SINCE','March 24, 2024']
        const search = imap.seq.search(['UNSEEN'], async (err,searchResults)=> {
            if (err) throw err

            console.log('search results ',searchResults.length)
            if(searchResults.length < 1){
                resolve(0)
                return
            }
            if(searchResults.length > 1000){
                console.log('over 1,000 results - limiting to 1,000!')
                searchResults = searchResults.slice(0,1000)
            }
            await fetchMessagesById(searchResults, config)
            resolve(searchResults.length)
        })
    })
}

function fetchUnseenMessages(config){
    return new Promise(async (resolve, reject) => {

        imap.openBox(process.env.IMAPDIR, async function(err, box){
            if (err) throw err

            //console.log('box',box)
            console.log('Total Messages: ',box.messages.total)
            try{
                await downloadUnseenMessages(config)
            }catch(err){
                console.log('downloadUnseenMessages error!',err)
            }
            resolve(0)
        })
    })
}

function fetchMessages(config){
    return new Promise(async (resolve, reject) => {

        imap.openBox(process.env.IMAPDIR, function(err, box){
            if (err) throw err
            console.log('box',box)
            console.log('Total Messages: ',box.messages.total)
            
            let messagesToFetch = 1000
            let messagesProcessed = 0

            const lastSeqNo = box.messages.total
            const fetchRange = `${(box.messages.total-messagesToFetch)}:${(lastSeqNo)}`
            messagesToFetch++ //increment because this range is inclusive and returns 1 addl

            console.log('Fetch Range ',fetchRange)

            const fetch = imap.seq.fetch(fetchRange, {
                //bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                bodies:'',
                struct: true,
                markSeen: true,
            })
            
            fetch.on('message', function(msg, seqno) {
                console.log('#%d Message', seqno)
                msg.on('body', async function(stream, info) {
                    let email
                    //try{
                        email = await simpleParser(stream)
                    //}catch(err){
                    //    console.log('error parsing!', err)
                    //    reject(err)
                    //}
                    await saveEmailToDatabase(email, config)
                    await saveAllEmailAttachments(email, config)
                    messagesProcessed++
                    console.log(`seq ${seqno}, message ${messagesProcessed}`)
                    if(messagesProcessed >= messagesToFetch){
                        console.log('last message processed - resolve')
                        resolve()
                    }
                })
                msg.on('end', function() {
                    console.log('#%d Msg End', seqno)
                })
            })
            fetch.once('error', function(err) {
                console.log('Fetch error: ' + err)
                throw err
            })
            fetch.once('end', function() {
                console.log('Done fetching all messages!')
                imap.end()
            })
        })
    })
}
async function saveAllEmailAttachments(email, config){
    //console.log("saveAllEmailAttachments "+email.messageId)
    //console.log(email.text)

    email.attachments.forEach(async function(attachment){
        console.log('saving file '+config.photoDir+'/'+attachment.filename)
        //console.log(attachment)
        try {
            await fs.writeFile(config.photoDir+'/'+ Utils.getAttachmentFileName(attachment), attachment.content)
        } catch (err) {
            console.log(err)
        }
    })
}
async function saveEmailToDatabase(email, config){
    console.log("saveEmailToDatabase "+email.messageId)

    const ipRex = /IP Address: ([^\p{Cc}\p{Cn}\p{Cs}]*)$/gimu
    let ip = ipRex.exec(email.text)
    ip = ip[1] || ''

    const eventTypeRex = /Alarm Event: ([^\p{Cc}\p{Cn}\p{Cs}]*)$/gimu
    let eventType = eventTypeRex.exec(email.text)
    eventType = eventType[1] || ''
    eventType = Utils.formatEventType(eventType)

    //check if this exists - if so skip!
    
    const existingEvent = await config.db.checkIfMessageIdExists(email.messageId)
    console.log(existingEvent)
    if(existingEvent?.messageid && existingEvent.messageid !== null){
        console.log('existing event found, skipping!')
        return
    }

    //console.log('insert eventType:',eventType)
    const eventresult = await config.db.createEvent({
        datetime: email.date,
        type:eventType,
        camera:email.subject,
        ip:ip,
        messageid:email.messageId,
        text:email.text
    })
    //console.log('eventresult',eventresult)
    //console.log('eventresult.lastID:',eventresult.lastID)

    email.attachments.forEach(async function(attachment){
        //console.log('insert eventattachment '+attachment.filename)

        await config.db.createEventAttachment({
            eventId:eventresult.lastID,
            file:Utils.getAttachmentFileName(attachment)
        })
    })
        
}
async function markAllMessagesUnseen(){
    return new Promise(async (resolve, reject) => {
        imap.openBox(process.env.IMAPDIR, async function(err, box){
            if (err) throw err

            console.log('box',box)
            console.log('Total Messages: ',box.messages.total)

            imap.delFlags(`1:${box.messages.total}`,['\\Seen'],function(err){
                if (err) throw err
                resolve()
            })
        })
    })
}
async function doImapThing(callback, config){
    return new Promise(async (resolve, reject) => {

        imap.once('ready', async function() {
            console.log('Imap ready')
            resolve(await callback(config))
            console.log('Imap ready done')
        })

        imap.once('error', function(err) {
            console.log('Imap error')
            reject(err)
        })
        
        imap.once('end', function() {
            console.log('Imap end')
        })
        
        imap.connect()
    })
}

module.exports={
    markAllMessagesUnseen:async function(){
        return doImapThing(markAllMessagesUnseen)
    },
    saveAllEventsToDbDownloadAttachments:async function(config){
        return doImapThing(fetchMessages, config)
    },
    saveUnseenEventsToDbDownloadAttachments:async function(config){
        return await doImapThing(fetchUnseenMessages, config)
    },
}