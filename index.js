// Imports
const express = require('express');
const routes = require('./routes.js');
const api = require('./api.js');
const cacheTable = require('./modified.json');
var db = require("./database.js");
const jsonData = require("./test_pruned.json");


// Express initialization
const app = express();

async function findAllOneWayFlights(origin, dest, date, num_adults) {
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

		results2 = []
		for (let j = 0; j < results.length; j++) {
			const getEach = results[j];
			results2.push(filterOneWayResult(getEach));
		}

		// const FileSystem = require("fs");
		// FileSystem.writeFile('test_pruned.json', JSON.stringify(results2), (error) => {
		// 	 if (error) throw error;
		// });

		return results2;
	} catch (e) {
		console.log(e);
		return e;
	}
}

async function randomTest() {
	dat = await api.oneWaySearch('JFK', 'SAV', '2023-02-22', 1);
	console.log(dat);
	results2 = []
	for (let j = 0; j < dat.length; j++) {
			const getEach = dat[j];
			results2.push(filterOneWayResult(getEach));
	}
	const FileSystem = require("fs");
	FileSystem.writeFile('test_pruned_2.json', JSON.stringify(results2), (error) => {
		 if (error) throw error;
	});
}

//randomTest();

function filterOneWayResult(currResult) {

	const mergeById = (a1, a2) =>
    a1.map(itm => ({
        ...a2.find((item) => (item.segmentId === itm.id) && item),
        ...itm
    }));

	resultObject = {}
	resultObject.duration = currResult.itineraries[0].duration;
	resultObject.segments = mergeById(currResult.itineraries[0].segments, currResult.travelerPricings[0].fareDetailsBySegment)
	resultObject.price = currResult.price.total;
	return resultObject;
}

// findAllOneWayFlights('JFK', 'MIA', '2023-02-22', 1);


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

/**
 * Iterates through entire Subscription Table.
 * If a desired flight's date has expired, the subscription is removed from the table.
 * Otherwise, it finds the cheapest flight for the given subscription.
 * If the price is cheaper than the given threshold, a Twilio text notification is sent and the subscription is deleted.
 */
function asyncSubscribeJob() {
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
					}
				})
			}
		})
	})
}

// Routes declaration
app.use('/public', express.static('public'));
app.use('/', routes.get_home);
app.use('/search', routes.get_search);
app.use('/subscribe', routes.post_subscribe);

// Initialize server
const port = 3000;
const server = app.listen(port, () => {
	console.log(`Now listening on port ${port}`);
	// asyncSubscribeJob()

	// Comment this in to constantly refresh and notify
	// setInterval(asyncSubscribeJob, 60 * 1000) // 60seconds
});

