var Amadeus = require('amadeus');

var amadeus = new Amadeus({
  clientId: 'mJk0UuvpgG1n1NKKudxEvTdYNAcHkeHj',
  clientSecret: 'ArWSjRGjep0MPysb'
});

async function oneWaySearch (origin, dest, date, num_adults) {
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
    oneWaySearch
  };