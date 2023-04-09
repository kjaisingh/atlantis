// Imports
const duffelClient = require('./duffel-client');
const cacheTable = require('./cache-table.json');
const lookupMap = require('./lookup-map.json');
const e = require('express');

/**
 * Returns a list of the one way flights in order of increasing price
 * @param origin: departing airport, eg. LAX 
 * @param dest: destination airport, eg. JFK 
 * @param date: departure date YYYY-MM-DD, eg. "2023-05-31"
 * @param num_adults: the number of travelers (>0), eg. 1
 * @returns 
 */
async function findAllOneWayFlights(origin, dest, date, num_adults) {
    try {
        const requisiteRow = cacheTable.filter(function (entry) {
            return entry.X === origin && entry.Y == dest;
        });

        var results = []

        if (requisiteRow.length > 0) {
            var zArrayFromRow = requisiteRow[0].Z;
            zArrayFromRow = zArrayFromRow.filter(e => e !== origin);
            zArrayFromRow.push(dest)
            resultsList = await fetchData(origin, zArrayFromRow, date, num_adults)
            for (let i = 0; i < resultsList.length; i += 1) {
                const filtered = filterJSONResult(resultsList[i].offers, dest)
                results = results.concat(filtered);
            }
        } else {
            const directSearch = await duffelClient.oneWayLookup(origin, dest, date, num_adults);
            results = results.concat(directSearch.offers);
        }

        results2 = []
        for (let j = 0; j < results.length; j++) {
            const getEach = results[j];
            results2.push(OneWayFilterItems(getEach, 0));
        }

        results2.sort(function (a, b) { return a.price - b.price; });
        results2 = filterData(results2, num_adults, dest);
        return results2;
    } catch (e) {
        console.log(e);
        return e;
    }
}

async function fetchData(origin, zArray, dep_date, num_adults) {
    const promises = zArray.map(arg => duffelClient.oneWayLookup(origin, arg, dep_date, num_adults));
    const results = await Promise.all(promises);
    return results
}

/**
 * Returns round trip flights
 * @param origin: departing airport, eg. LAX 
 * @param dest: destination airport, eg. JFK 
 * @param departure_date: departure date YYYY-MM-DD, eg. "2023-05-31"
 * @param return_date: return date YYYY-MM-DD, eg. "2023-06-31"
 * @param passengers: the number of travelers (>0), eg. 1
 * @returns 
 */
async function findAllRoundTripFlights(origin, dest, departure_date, return_date, passengers) {

    var direct = await findDirectReturnFlights(origin, dest, departure_date, return_date, passengers)
    var separate = await crossProductRoundTrip(origin, dest, departure_date, return_date, passengers)

    combined = []
    combined = combined.concat(direct)
    combined = combined.concat(separate)

    combined.sort(function (a, b) {
        return a[0].price - b[0].price
    })


    var uniqueElements = removeDuplicates(combined)
    return uniqueElements;

}

// Helper Functions

/**
 * Filters the data returned from one way searches
 * @param {*} data 
 * @returns 
 */
function filterData(data, num_adults, dest) {
    retList = []
    var directPutOnTop = false;
    for (let i = 0; i < data.length; i += 1) {
        currSegs = data[i].segments
        currObj = {}
        currObj.airline = currSegs[0].carrierName
        path = currSegs[0].origin
        layovers = []
        var destIndex = -1
        for (let j = 0; j < currSegs.length; j += 1) {
            nextDest = " → ".concat(currSegs[j].destination)
            if (currSegs.length >= 2 && j < currSegs.length - 1) {
                layovers.push(currSegs[j].destination)
            }
            cities = lookupMap[dest] ? lookupMap[dest] : [dest];
            if (cities.includes(currSegs[j].destination)) {
                destIndex = j
            }
            path = path.concat(nextDest)
        }
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        };
        currObj.path = path
        currObj.price = data[i].price
        currObj.bookingLink = getBookingLink(currSegs[0].origin, currSegs[currSegs.length - 1].destination, currSegs[0].departureTime.substring(0, 10), currSegs[0].carrierCode, layovers, num_adults)
        currObj.departureTime = new Date(currSegs[0].departureTime).toLocaleString('en-US', options);
        if (destIndex === -1) {
            continue;
        }
        currObj.arrivalTime = new Date(currSegs[destIndex].arrivalTime).toLocaleString('en-US', options);
        if (!directPutOnTop && (currSegs[currSegs.length - 1].destination === dest)) {
            retList.unshift(currObj);
            directPutOnTop = true;
        } else {
            retList.push(currObj)
        }
    }
    return retList
}

function getBookingLink(source, dest, date, airline, layovers, num_adults) {
    var link = "https://www.kayak.com/flights/"
    var layoverString = ""
    if (layovers.length > 0) {
        layoverString = layoverString.concat(layovers[0])
    }
    for (let i = 1; i < layovers.length; i += 1) {
        layoverString = layoverString.concat("\,", layovers[i])
    }
    link = link.concat(source, "-", dest, "/", date, "/", num_adults, "adults?sort=price_a&fs=airlines=~", airline, ";stops=~", layovers.length, ";layoverair=", layoverString);
    return link;
}

/**
 * Filters the result returned by Duffel to keep only the necessary info
 * @param {} obj
 * @returns
 */
function OneWayFilterItems(obj, sliceNum) {
    returnObj = {}
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
            console.log("Flight Number:", curr[j].operating_carrier_flight_number)
            console.log("Airline:", curr[j].operating_carrier.name)
        }
        console.log("Price:", data[i].total_amount)
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
        }
        //printAllSourceDest(finList);
        return finList;
    } catch (e) {
        console.log(e);
    }
}


async function findDirectReturnFlights(origin, dest, departure_date, return_date, passengers) {
    results = await duffelClient.roundTripLookup(origin, dest, departure_date, return_date, passengers)
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

    var a = await makeDirectRoundTripConsistent(retList)
    return a
}

async function makeDirectRoundTripConsistent(data) {
    retList = []
    for (let i = 0; i < data.length; i += 1) {
        curr = data[i]
        currList = []
        currList.push({ 'price': curr[0].price })
        outboundObj = {}
        inboundObj = {}
        outboundObj.segments = curr[0].segments
        inboundObj.segments = curr[1].segments
        currList.push(outboundObj)
        currList.push(inboundObj)
        retList.push(currList)
    }
    return retList
}

async function crossProductRoundTrip(origin, dest, departure_date, return_date, passengers) {

    var result1 = await findAllOneWayFlights(origin, dest, departure_date, passengers)
    var result2 = await findAllOneWayFlights(dest, origin, return_date, passengers)

    retList = []
    for (let i = 0; i < Math.min(result1.length, 25); i += 1) {
        for (let j = 0; j < Math.min(result2.length, 25); j += 1) {
            curr1 = result1[i]
            curr2 = result2[j]
            totPrice = parseFloat(curr1.price) + parseFloat(curr2.price)
            totPrice = totPrice.toFixed(2);
            currList = []
            outboundObj = {}
            inboundObj = {}
            outboundObj.segments = curr1.segments
            inboundObj.segments = curr2.segments
            currList.push({ 'price': totPrice })
            currList.push(outboundObj)
            currList.push(inboundObj)
            retList.push(currList)
        }
    }

    retList.sort(function (a, b) {
        return a[0].price - b[0].price;
    });

    return retList
}

function removeDuplicates(array) {
    return array.filter((item, index, arr) =>
        arr.findIndex((t) => lodash.isEqual(t, item)) === index
    );
}

module.exports = {
    filterData,
    findAllOneWayFlights,
    findAllRoundTripFlights,
    getBookingLink
};