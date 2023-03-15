// Import libraries
const express = require('express');
var bodyParser = require('body-parser');
var session = require('express-session');
const lodash = require('lodash')

// Import modules
const routes = require('./routes.js');
const api = require('./api.js');
const duffel = require('./duffel_api.js');
var db = require("./database.js");
// const jsonData = require("./duffel_test_3.json");
// const jsonData2 = require("./duffel_test_3.json");
// const jsonData3 = require("./two_way_filtered.json");
// const jsonData4 = require("./cross_product_filtered_2.json");
//const jsonData5 = require("./all_rt_results.json");
// const jsonData6 = require("./cross_product_filtered_2.json");

// Express initialization
const app = express();

/**
 * Iterates through entire Subscription Table.
 * If a desired flight's date has expired, the subscription is removed from the table.
 * Otherwise, it finds the cheapest flight for the given subscription.
 * If the price is cheaper than the given threshold, a Twilio text notification is sent and the subscription is deleted.
 */
function asyncSubscribeJob() {
	console.log('Starting subscription job');
	db.getAllSubscriptions(function (err, data) {
		data.Items.forEach(entry => {
			split = entry.itinerary.S.split('+');
			date = Date.parse(split[2]);
			if (date < Date.parse(new Date().toISOString().split('T')[0])) {
				console.log('deleting subscription from the table');
				db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
			} else {
				duffel.findAllOneWayFlights(split[0], split[1], split[2], 1).then(results => {
					prices = [];
					results.forEach(flight => prices.push(parseFloat(flight.price.total)));
					minPriceIdx = prices.indexOf(Math.min(...prices));
					idealFlight = results[minPriceIdx];
					minPrice = Math.min(...prices);
					if (minPrice < parseFloat(entry.price_threshold.N)) {
						notif = `Hi ${entry.user.S}! This is Atlantis! \n`;
						notif += `We found a flight from ${split[0]} to ${split[1]} on ${split[2]} that is less than your threshold: $${entry.price_threshold.N}! \n`;
						notif += `The flight costs $${minPrice} and follows this path:\n`;

						idealFlight.itineraries[0].segments.forEach(segment => {
							carrierCode = segment.operating ? segment.operating.carrierCode : '';
							flightNumber = segment.number ? segment.number : '';
							notif += `${segment.departure.iataCode} -> ${segment.arrival.iataCode}with flight number ${carrierCode} ${flightNumber} \n`;
						})

						notif += `Thanks for being an Atlantis customer!`;
						api.sendTxtNotif(notif, entry.mobile_number.S);
						db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
					}
				})
			}
		})
	})
}

function filterData(data) {
	retList = []
	for (let i = 0; i < data.length; i += 1) {
		currSegs = data[i].segments
		currObj = {}
		currObj.airline = currSegs[0].carrierName
		path = currSegs[0].origin
		for (let j = 0; j < currSegs.length; j += 1) {
			nextDest = " -> ".concat(currSegs[j].destination)
			path = path.concat(nextDest)
		}
		currObj.path = path
		currObj.price = data[i].price
		currObj.duration = data[i].totalDuration
		retList.push(currObj)
	}
	const FileSystem = require("fs");
    FileSystem.writeFile('filtered_test.json', JSON.stringify(retList), (error) => {
         if (error) throw error;
    });
}

// Routes initialization
app.use('/public', express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'mysecret' }));

// Routes declaration
app.get('/', routes.get_home);
app.post('/search', routes.post_search);
app.post('/subscribe', routes.post_subscribe);

// Initialize server
const port = 3000;
const server = app.listen(port, () => {
	console.log(`Now listening on port ${port}`);
	// asyncSubscribeJob()

	// Comment this in to constantly refresh and notify
	// setInterval(asyncSubscribeJob, 60 * 1000) // 60seconds
});

