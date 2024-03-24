'use strict';

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
            console.log(box)
            var f = imap.seq.fetch(box.messages.total+':'+(box.messages.total-300), {
                //bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                bodies:'',
                struct: true
            })
            f.on('message', function(msg, seqno) {
                console.log('Message #%d', seqno)
                var prefix = '(#' + seqno + ') '
                msg.on('body', async function(stream, info) {
                    let email
                    try{
                        email = await simpleParser(stream)
                    }catch(err){
                        console.log('error parsing!', err)
                        return
                    }
                    saveEmailToDatabase(email, config)
                    await saveAllEmailAttachments(email, config)
                })
                // var buffer = ''
                // stream.on('data', function(chunk) {
                //     buffer += chunk.toString('utf8')
                // })
                // stream.once('end', function() {
                //     console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)))
                // })
                // })
                // msg.once('attributes', function(attrs) {
                //     console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8))
                //     //fetchAttachments(seqno, attrs)
                // })
                // msg.once('end', function() {
                //     console.log(prefix + 'Finished')
                // })
            })
            f.once('error', function(err) {
                console.log('Fetch error: ' + err)
            })
            f.once('end', function() {
                console.log('Done fetching all messages!')
                imap.end()
            })
        })
    })
}
async function saveAllEmailAttachments(email, config){
    console.log("message id "+email.messageId)
    console.log(email.text)
    //console.log(email.attachments)

    email.attachments.forEach(async function(attachment){
        console.log('saving file '+config.photoDir+'/'+attachment.filename)
        try {
            await fs.writeFile(config.photoDir+'/'+ attachment.filename, attachment.content)
        } catch (err) {
            console.log(err)
        }
    })
}
async function saveEmailToDatabase(email, config){
    //console.log(email)

    const ipRex = /IP Address: ([^\p{Cc}\p{Cn}\p{Cs}]*)$/gimu
    const ip = ipRex.exec(email.text)

    const eventTypeRex = /Alarm Event: ([^\p{Cc}\p{Cn}\p{Cs}]*)$/gimu
    const eventType = eventTypeRex.exec(email.text)

    console.log('eventType:',eventType)
    const eventresult = await config.db.run(
        'INSERT INTO event (datetime,type,camera,ip,text) VALUES ($datetime,$type,$camera,$ip,$text)',{
        $datetime: email.date,
        $type:eventType[1],
        $camera:email.subject,
        $ip:ip[1],
        $text:email.text
    })
    console.log('eventresult',eventresult)
    console.log('eventresult.lastID:',eventresult.lastID)

    email.attachments.forEach(async function(attachment){
        console.log('saving file '+attachment.filename)

        const result = await config.db.run(
            'INSERT INTO eventattachment (eventid,filename) VALUES (?,?)',
            eventresult.lastID,
            attachment.filename
        )
    })
        
}

module.exports={
    saveEventsToDbDownloadAttachments:async function(config){

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
            })
            
            imap.connect()
        })
    }
}