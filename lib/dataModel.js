'use strict';

const sqlite3  = require( 'sqlite3')
const { open }  = require( 'sqlite')

class dataModel {
    constructor(){
        (async () => {
            this.db = await open({
                filename: process.env.SQLLITEDATA,
                driver: sqlite3.Database
            })
        })()
    }
    async openDb(){
    }
    async begin(){
    }
    end(){
        this.db.close()
    }
    async getMaxEventDate(){
        console.log(this.db)
        return await this.db.get(`SELECT max(datetime) maxDate FROM event `)
    }
    getAllEventsAndAttachments(){
        return this.db.all(
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
            event.eventid DESC, eventattachment.filename ASC`
        )
    }
    checkIfMessageIdExists(messageId){
        return this.db.get(`SELECT messageid FROM event where messageid=$messageid`,{$messageid:messageId})
    }
    createEvent(event){
        return this.db.run(
            'INSERT INTO event (datetime,type,camera,ip,messageid,text) VALUES ($datetime,$type,$camera,$ip,$messageid,$text)',{
            $datetime:event.datetime,
            $type:event.type,
            $camera:event.camera,
            $ip:event.ip,
            $messageid:event.messageid,
            $text:event.text,
        })
    }
    createEventAttachment(eventAttachment){
        return this.db.run(
            'INSERT INTO eventattachment (eventid,filename) VALUES ($id,$file)',{
                $id: eventAttachment.eventId,
                $file: eventAttachment.file
            }
        )
    }
}

module.exports = dataModel