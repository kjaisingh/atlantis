// Imports
const config = require('./config.json')

// Twilio Connection
const twilio_client = require("twilio")(config.twilio.accountSid, config.twilio.authToken);

/**
 * Uses Twilio Client to Send a Text Notification
 * @param body: the message to send, eg. "hello, how are you?" 
 * @param to: the mobile number of the recipient: "+1-xxx-xxx-xxxx", eg "+1-123-456-7890" 
 */
async function sendTextNotification(body, to) {
  twilio_client.messages
    .create({
      body: body,
      messagingServiceSid: 'MG0467546a68fc987e65a0640dc66aadfb',
      to: to
    })
    .then(message => console.log(message.sid))
}

// Exports
module.exports = {
  sendTextNotification
};