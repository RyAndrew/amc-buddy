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

function fetchMessages(config){
    return new Promise(async (resolve, reject) => {

        imap.openBox(process.env.IMAPDIR, function(err, box){
            if (err) throw err
            //console.log('box',box)
            console.log('Total Messages: ',box.messages.total)

            const lastSeqNo = box.messages.total-10
            const fetchRange = `${(box.messages.total-20)}:${(lastSeqNo)}`
            console.log('Fetch Range ',fetchRange)

            const fetch = imap.seq.fetch(fetchRange, {
                //bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                bodies:'',
                struct: true
            })
            fetch.on('message', function(msg, seqno) {
                console.log('#%d Message', seqno)
                msg.on('body', async function(stream, info) {
                    let email
                    try{
                        email = await simpleParser(stream)
                    }catch(err){
                        console.log('error parsing!', err)
                        return
                    }
                    await saveEmailToDatabase(email, config)
                    await saveAllEmailAttachments(email, config)
                    if(lastSeqNo === seqno){
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
        //console.log('saving file '+config.photoDir+'/'+attachment.filename)
        try {
            await fs.writeFile(config.photoDir+'/'+ attachment.filename, attachment.content)
        } catch (err) {
            console.log(err)
        }
    })
}
async function saveEmailToDatabase(email, config){
    //console.log("saveEmailToDatabase "+email.messageId)

    const ipRex = /IP Address: ([^\p{Cc}\p{Cn}\p{Cs}]*)$/gimu
    const ip = ipRex.exec(email.text)

    const eventTypeRex = /Alarm Event: ([^\p{Cc}\p{Cn}\p{Cs}]*)$/gimu
    const eventType = Utils.formatEventType(eventTypeRex.exec(email.text))

    //console.log('insert eventType:',eventType)
    const eventresult = await config.db.run(
        'INSERT INTO event (datetime,type,camera,ip,text) VALUES ($datetime,$type,$camera,$ip,$text)',{
        $datetime: email.date,
        $type:eventType[1],
        $camera:email.subject,
        $ip:ip[1],
        $text:email.text
    })
    //console.log('eventresult',eventresult)
    //console.log('eventresult.lastID:',eventresult.lastID)

    email.attachments.forEach(async function(attachment){
        //console.log('insert eventattachment '+attachment.filename)

        await config.db.run(
            'INSERT INTO eventattachment (eventid,filename) VALUES (?,?)',
            eventresult.lastID,
            attachment.filename
        )
    })
        
}

module.exports={
    saveAllEventsToDbDownloadAttachments:async function(config){

        return new Promise(async (resolve, reject) => {

            imap.once('ready', async function() {
                console.log('Imap ready')
                await fetchMessages(config)
                resolve()
            })
            imap.once('error', function(err) {
                console.log('Imap error')
                reject(err)
            })
            
            imap.once('end', function() {
                console.log('Imap end')
                //resolve()
            })
            
            imap.connect()
        })
    }
}