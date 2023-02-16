// Imports
const express = require('express');
const routes = require('./routes.js');
const api = require('./api.js');
const cacheTable = require('./modified.json');
var db = require("./database.js");


// Express initialization
const app = express();

async function findAllFlights(origin, dest, date, num_adults) {
	try {

		const requisiteRow = cacheTable.filter(function (entry) {
			return entry.X === origin && entry.Y == dest;
		});

		const zArrayFromRow = requisiteRow[0].Z;
		var results = []
		const directSearch = await api.oneWaySearch(origin, dest, date, num_adults);
		results = results.concat(directSearch);
		for (let i = 0; i < zArrayFromRow.length; i++) {
			const res = await api.oneWaySearch(origin, zArrayFromRow[i], date, num_adults);
			const filtered = filterJSONResult(res, dest)
			results = results.concat(filtered);
		}

		return results;
	} catch (e) {
		console.log(e);
		return e;
	}
}

function printAllSourceDest(data) {
	for (let i = 0; i < data.length; i++) {
		const curr = data[i].itineraries[0].segments;
		arrList = []
		for (let j = 0; j < curr.length; j++) {
			const dep = curr[j].departure.iataCode;
			const arr = curr[j].arrival.iataCode;
			console.log("DEP:", dep);
			console.log("ARR:", arr);
		}
		console.log();
	}
}

function filterJSONResult(dataToFilter, dest) {

	try {
		var finList = []
		for (let i = 0; i < dataToFilter.length; i++) {
			const curr = dataToFilter[i].itineraries[0].segments;
			var arrList = []
			for (let j = 0; j < curr.length; j++) {
				const arr = curr[j].arrival.iataCode;
				arrList.push(arr);
			}
			if (arrList.includes(dest)) {
				finList = finList.concat(dataToFilter[i]);
			}
		}
		return finList;
	} catch (e) {
		console.log(e);
	}
}

function asyncSubJob() {
	console.log('Starting subscription job')
	db.getAllSubscriptions(function (err, data) {
		data.Items.forEach(entry => {
			split = entry.itinerary.S.split('+')
			date = Date.parse(split[2])
			if (date < Date.parse(new Date().toISOString().split('T')[0])) {
				console.log('deleting subscription from the table')
				db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S)
			} else {
				findAllFlights(split[0], split[1], split[2], 1).then(results => {
					prices = []
					results.forEach(flight => prices.push(parseFloat(flight.price.total)))
					minPriceIdx = prices.indexOf(Math.min(...prices))
					idealFlight = results[minPriceIdx]
					minPrice = Math.min(...prices)
					if (minPrice < parseFloat(entry.price_threshold.N)) {

						notif = `Hi ${entry.user.S}! This is Atlantis! \n`
						notif += `We found a flight from ${split[0]} to ${split[1]} on ${split[2]} that is less than your threshold: $${entry.price_threshold.N}! \n`
						notif += `The flight costs $${minPrice} and follows this path:\n`

						idealFlight.itineraries[0].segments.forEach(segment => {
							carrierCode = segment.operating ? segment.operating.carrierCode : ''
							flightNumber = segment.number ? segment.number : ''
							notif += `${segment.departure.iataCode} -> ${segment.arrival.iataCode} with flight number ${carrierCode} ${flightNumber} \n`
						})

						notif += `Thanks for being an Atlantis customer!`
						api.sendTxtNotif(notif, entry.mobile_number.S)
						db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S)
					} else {
						api.sendTxtNotif("failed", entry.mobile_number.S)
					}
				})
			}
		})
	})
}

// Routes declaration
app.use('/public', express.static('public'));
app.use('/', routes.get_home);

// Initialize server
const port = 3000;
const server = app.listen(port, () => {
	console.log(`Now listening on port ${port}`);
	//console.log(results[10].itineraries[0].segments)
	asyncSubJob()
	// setInterval(asyncSubJob, 60 * 1000) // 60seconds
});

