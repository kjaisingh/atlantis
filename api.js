var Amadeus = require('amadeus');

var amadeus = new Amadeus({
  clientId: 'qZG6sPsYzKEWfvXpegU1snPZvjqAYKW3',
  clientSecret: 'oxZUUWnaXAYXPG0T'
});

const accountSid = "ACed5c638cdc16064ccf9be937ac79952a"
const authToken = "b856ef36b48934e304b256f7e1e69ff3"
const client = require("twilio")(accountSid, authToken);

async function sendTxtNotif(body, to) {
  client.messages
    .create({
      body: body,
      messagingServiceSid: 'MG0467546a68fc987e65a0640dc66aadfb',
      to: to
    })
    .then(message => console.log(message.sid))
}

async function oneWaySearch(origin, dest, date, num_adults) {
  try {
    const x = await amadeus.shopping.flightOffersSearch.get({
      originLocationCode: origin,
      destinationLocationCode: dest,
      departureDate: date,
      adults: num_adults,
      currencyCode: "USD"
    })
    return x.data;
  }
  catch (err) {
    return err;
  }
}

module.exports = {
  oneWaySearch,
  sendTxtNotif
};