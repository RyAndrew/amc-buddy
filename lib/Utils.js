'use strict';

module.exports = {
  formatDateYmd:function(input){
    if(!(input instanceof Date)){
      input = new Date(parseInt(input))
    }
    return input.toLocaleDateString('en-US')
  },
  formatDateHms:function(input){
    if(!(input instanceof Date)){
      input = new Date(parseInt(input))
    }
    return input.toLocaleTimeString('en-US')
  },
  formatDateYmdHms:function(input){
    if(!(input instanceof Date)){
      input = new Date(parseInt(input))
    }
    return input.toLocaleString('en-US')
  },
  formatCamera:function(camera){
    return camera.replace('FC Cam','')
  },
  formatEventType:function(type){
    if(type==='SMD(Human)'){
      return 'Human'
    }
    if(type==='SMD(Vehicle)'){
      return 'Vehicle'
    }
    return type
  },
  sortObjectArray:function(inputArr, sort){
    const compareProperty=function({ key, direction }) {
      return function (a, b) {
          const ap = a[key] || ''
          const bp = b[key] || ''
    
          return (direction === "desc" ? -1 : 1) * ((typeof ap === "string" && typeof bp === "string") ? ap.localeCompare(bp) : ap - bp)
      }
    }

    return inputArr.sort(compareProperty(sort))
  },
  getAttachmentFileName:function(attachment){
    return attachment.filename.slice(0, -4)+'_'+attachment.checksum+'.jpg'
  },
}