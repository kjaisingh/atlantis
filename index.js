// Imports
const express = require('express');
const routes = require('./routes.js');
const api = require('./api.js');
const duffel = require('./duffel_api.js');
const cacheTable = require('./modified.json');
var db = require("./database.js");
const jsonData = require("./duffel_return_test.json");


// Express initialization
const app = express();


async function findAllOneWayFlights(origin, dest, date, num_adults) {
	try {
		const requisiteRow = cacheTable.filter(function (entry) {
			return entry.X === origin && entry.Y == dest;
		});

		const zArrayFromRow = requisiteRow[0].Z;
		var results = []
		const directSearch = await duffel.oneWayLookup(origin, dest, date, num_adults);
		//console.log("Direct:", directSearch)
		results = results.concat(directSearch.offers);
		for (let i = 0; i < zArrayFromRow.length; i++) {
			const res = await duffel.oneWayLookup(origin, zArrayFromRow[i], date, num_adults);
			const filtered = filterJSONResult(res.offers, dest)
			results = results.concat(filtered);
		}

		const FileSystem = require("fs");
		// FileSystem.writeFile('random.json', JSON.stringify(results), (error) => {
        //    if (error) throw error;
		// });

		results2 = []
		for (let j = 0; j < results.length; j++) {
			const getEach = results[j];
			//console.log(getEach)
			results2.push(OneWayFilterItems(getEach, 0));
		}

		results2.sort(function(a, b) {
			return a.price - b.price;
		});

		FileSystem.writeFile('result_test.json', JSON.stringify(results2), (error) => {
           if (error) throw error;
		});

		return results2;
	} catch (e) {
		console.log(e);
		return e;
	}
}

findAllOneWayFlights('ORD', 'SFO', '2023-03-29', 1)

// duffel.roundTripLookup('PHL', 'LAX', '2023-04-04', '2023-05-05', 1)

/**
 * Filters the result returned by Duffel to keep only the necessary info
 * @param {} obj 
 * @returns 
 */
function OneWayFilterItems(obj, sliceNum) {
	returnObj = {}
	//returnObj.segments = obj.slices[0].segments
	returnObj.price = obj.total_amount
	returnObj.fareType = obj.slices[sliceNum].fare_brand_name
	segmentsArr = []
	for (let i = 0; i < obj.slices[sliceNum].segments.length; i += 1) {
		currObj = {}
		currObj.origin = obj.slices[sliceNum].segments[i].origin.iata_code
		currObj.destination = obj.slices[sliceNum].segments[i].destination.iata_code
		currObj.flightNumber = obj.slices[sliceNum].segments[i].marketing_carrier_flight_number
		currObj.carrierCode = obj.slices[sliceNum].segments[i].marketing_carrier.iata_code
		currObj.carrierName = obj.slices[sliceNum].segments[i].marketing_carrier.name
		currObj.departureTime = obj.slices[sliceNum].segments[i].departing_at
		currObj.arrivalTime = obj.slices[sliceNum].segments[i].arriving_at
		currObj.duration = obj.slices[sliceNum].segments[i].duration
		segmentsArr.push(currObj);
	}
	returnObj.segments = segmentsArr
	returnObj.totalDuration = obj.slices[sliceNum].duration
	//console.log(jsonData.data.offers[5].slices[0]);
	//console.log(returnObj)
	return returnObj;
}

/**
 * Given a list of itineraries, prints all the source and destination pairs in each itinerary
 * @param {*} data 
 */
function printAllSourceDest(data) {
	for (let i = 0; i < data.length; i++) {
		const curr = data[i].slices[0].segments;
		arrList = []
		for (let j = 0; j < curr.length; j++) {
			const dep = curr[j].origin.iata_code;
			const arr = curr[j].destination.iata_code;
			console.log("DEP:", dep);
			console.log("ARR:", arr);
			console.log("Flight Number:",curr[j].operating_carrier_flight_number)
			console.log("Airline:",curr[j].operating_carrier.name)
		}
		console.log("Price:",data[i].total_amount)
		console.log("Fare Type:", data[i].slices[0].fare_brand_name)
		console.log();
	}
}

/**
 * Given some flight results and a destination, finds all flights that go through the given destination
 * @param {} dataToFilter 
 * @param {*} dest 
 * @returns 
 */
function filterJSONResult(dataToFilter, dest) {
	try {
		var finList = []
		for (let i = 0; i < dataToFilter.length; i++) {
			const curr = dataToFilter[i].slices[0].segments;
			var arrList = []
			for (let j = 0; j < curr.length; j++) {
				const arr = curr[j].destination.iata_code;
				arrList.push(arr);
			}
			if (arrList.includes(dest)) {
				finList = finList.concat(dataToFilter[i]);
			}
			//console.log(arrList)
		}
		//printAllSourceDest(finList);
		return finList;
	} catch (e) {
		console.log(e);
	}
}


async function findDirectReturnFlights(origin, dest, departure_date, return_date, passengers) {
	results = await duffel.roundTripLookup(origin, dest, departure_date, return_date, passengers)
	offerList = results.offers
	retList = []
	for (let i = 0; i < offerList.length; i += 1) {
		currOffer = offerList[i]
		currFilteredOffer = []
		for (let j = 0; j < currOffer.slices.length; j += 1) {
			currObj = OneWayFilterItems(currOffer, j)
			currFilteredOffer.push(currObj)
		}
		retList.push(currFilteredOffer)
	}
	// const FileSystem = require("fs");
	// FileSystem.writeFile('two_way_filtered.json', JSON.stringify(retList), (error) => {
    //     if (error) throw error;
	// });
	return retList
}

//findAllReturnFlights('PHL', 'LAX', '2023-04-04', '2023-05-05', 1)

// console.log(jsonData.data.offers[0].slices.length)


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

