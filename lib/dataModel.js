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
    queryEventsAndAttachmentsOffset(offset, dateStart, dateEnd){
        const pageSize = 50
        offset = !offset ? 0 : parseInt(offset)
        dateStart = !dateStart ? 0 : dateStart
        dateEnd = !dateEnd ? 0 : dateEnd
        
        //offset = offset + 0.0
        console.log('offset',offset)
        console.log('typeof offset',typeof offset)
        if (typeof offset !== 'number' || offset < 0 || offset > 5000) {
            throw new Error('invalid offset')
        }

        const nowDate = new Date()
        if(dateStart === 0){
            dateStart = nowDate.toLocaleDateString('en-CA') + ' 00:00:00'
            console.log('dateStart',dateStart)
            dateStart = new Date(dateStart)
            console.log('dateStart',dateStart)
            dateStart = dateStart.getTime()
        }else{
            dateStart = new Date(dateStart)
            //dateStart = dateStart.toLocaleDateString('en-CA') + ' 00:00:00'
            //console.log('dateStart',dateStart)
            //dateStart = new Date(dateStart)
            console.log('dateStart',dateStart)
            dateStart = dateStart.getTime()
        }
        if(dateEnd === 0){
            dateEnd = nowDate.toLocaleDateString('en-CA') + ' 23:59:59'
            console.log('dateEnd',dateEnd)
            dateEnd = new Date(dateEnd)
            console.log('dateEnd',dateEnd)
            dateEnd = dateEnd.getTime()
        }else{
            dateEnd = new Date(dateEnd)
            //dateStart = dateStart.toLocaleDateString('en-CA') + ' 00:00:00'
            //console.log('dateStart',dateStart)
            //dateStart = new Date(dateStart)
            console.log('dateEnd',dateEnd)
            dateEnd = dateEnd.getTime()
        }

        // console.log('typeof dateStart',typeof dateStart)
        // if (isNaN(new Date(dateStart))) {
        //     throw new Error('invalid dateStart')
        // }
        console.log('pageSize',pageSize)
        console.log('offset',offset)
        console.log('dateStart',dateStart)
        console.log('dateEnd',dateEnd)

        return this.db.all(
        `SELECT
            event.eventid,
            event.datetime,
            event.type,
            event.camera,
            event.text,
            eventattachment.filename,
            event.favorite
        FROM 
            event 
            join eventattachment on eventattachment.eventid=event.eventid 
        WHERE
            event.datetime between $dateStart and $dateEnd
        ORDER BY
            event.datetime DESC, eventattachment.filename ASC
        LIMIT $pageSize OFFSET $offset`,{$pageSize:pageSize, $offset:offset, $dateStart:dateStart, $dateEnd:dateEnd}
        )
        //event.eventid ASC
    }
    // getAllEventsAndAttachments(){
    //     return this.db.all(
    //     `SELECT
    //         event.eventid,
    //         event.datetime,
    //         event.type,
    //         event.camera,
    //         event.text,
    //         eventattachment.filename 
    //     FROM 
    //         event 
    //         join eventattachment on eventattachment.eventid=event.eventid 
    //     ORDER BY
    //         event.eventid DESC, eventattachment.filename ASC
    //     LIMIT 100`
    //     )
    // }
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
    createFetch(){
        return this.db.run(
            'INSERT INTO fetch (datetime,type,camera,ip,messageid,text) VALUES ($datetime,$type,$camera,$ip,$messageid,$text)',{
            $datetime:event.datetime,
            $type:event.type,
            $camera:event.camera,
            $ip:event.ip,
            $messageid:event.messageid,
            $text:event.text,
        })
    }
    updateEventFavorite(eventId, favorite){
        return this.db.run(
            'UPDATE event SET favorite=$favorite WHERE eventid=$eventId',{
                $favorite: favorite,
                $eventId: eventId
            }
        )
    }
}

module.exports = dataModel