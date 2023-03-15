var axios = require('axios');
const cacheTable = require('./modified.json');


async function oneWayLookup(origin, dest, departure_date, passengers) {

  console.log("Searching for flights from", origin, "to", dest);
  oneAdult = {
    "type": "adult"
  }

  var data = {
    "data": {
      "slices": [
        {
          "origin": origin,
          "destination": dest,
          "departure_date": departure_date
        }
      ],
      "passengers": [
      ],
      "cabin_class": "economy"
    }
  };

  for (let i = 0; i < passengers; i = i + 1) {
    data.data.passengers.push(oneAdult);
  }

  data = JSON.stringify(data);

  var config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://api.duffel.com/air/offer_requests',
    headers: {
      'Accept-Encoding': 'gzip',
      'Accept': 'application/json',
      'Duffel-Version': 'beta',
      'Authorization': 'Bearer duffel_live_CB7c8vi41zfnvafzKqWqIXEwST_F5RG_8KwBKZsVGas',
      'Content-Type': 'application/json'
    },
    data: data
  };


  // axios(config)
  // .then(function (response) {
  //   const FileSystem = require("fs");
  //   FileSystem.writeFile('duffel_test_3.json', JSON.stringify(response.data), (error) => {
  //        if (error) throw error;
  //   });
  //   return response.data;
  // })
  // .catch(function (error) {
  //   console.log(error);
  // });

  try {
    const response = await axios(config);
    // const FileSystem = require("fs");
    // FileSystem.writeFile('duffel_test_4.json', JSON.stringify(response.data), (error) => {
    //      if (error) throw error;
    // });
    return response.data.data;
  } catch (err) {
    return err;
  }

}


async function roundTripLookup(origin, dest, departure_date, return_date, passengers) {

  console.log("Searching for flights from", origin, "to", dest, "and back");
  oneAdult = {
    "type": "adult"
  }

  var data = {
    "data": {
      "slices": [
        {
          "origin": origin,
          "destination": dest,
          "departure_date": departure_date,
        },
        {
          "origin": dest,
          "destination": origin,
          "departure_date": return_date
        }
      ],
      "passengers": [
      ],
      "cabin_class": "economy"
    }
  };

  for (let i = 0; i < passengers; i = i + 1) {
    data.data.passengers.push(oneAdult);
  }

  data = JSON.stringify(data);

  var config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://api.duffel.com/air/offer_requests',
    headers: {
      'Accept-Encoding': 'gzip',
      'Accept': 'application/json',
      'Duffel-Version': 'beta',
      'Authorization': 'Bearer duffel_live_CB7c8vi41zfnvafzKqWqIXEwST_F5RG_8KwBKZsVGas',
      'Content-Type': 'application/json'
    },
    data: data
  };


  // axios(config)
  // .then(function (response) {
  //   const FileSystem = require("fs");
  //   FileSystem.writeFile('duffel_test_3.json', JSON.stringify(response.data), (error) => {
  //        if (error) throw error;
  //   });
  //   return response.data;
  // })
  // .catch(function (error) {
  //   console.log(error);
  // });

  try {
    const response = await axios(config);
    const FileSystem = require("fs");
    // FileSystem.writeFile('duffel_return_test.json', JSON.stringify(response.data), (error) => {
    //      if (error) throw error;
    // });
    return response.data.data;
  } catch (err) {
    return err;
  }

}

async function findAllOneWayFlights(origin, dest, date, num_adults) {
  try {
    const requisiteRow = cacheTable.filter(function (entry) {
      return entry.X === origin && entry.Y == dest;
    });

    var results = []
    const directSearch = await oneWayLookup(origin, dest, date, num_adults);
    //console.log("Direct:", directSearch)
    results = results.concat(directSearch.offers);

    if (requisiteRow.length > 0) {
      const zArrayFromRow = requisiteRow[0].Z;
      for (let i = 0; i < zArrayFromRow.length; i++) {
        const res = await oneWayLookup(origin, zArrayFromRow[i], date, num_adults);
        const filtered = filterJSONResult(res.offers, dest)
        results = results.concat(filtered);
      }
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

    results2.sort(function (a, b) {
      return a.price - b.price;
    });

    // FileSystem.writeFile('duffel_test_fin.json', JSON.stringify(results2), (error) => {
    //   if (error) throw error;
    // });

    return results2;
  } catch (e) {
    console.log(e);
    return e;
  }
}

// USED IN NOTIFICATION FUNCTION DON'T UNCOMMENT OR DELETE
// Helper function to filter returned data from API 
function filterData(data) {
  retList = []
  for (let i = 0; i < data.length; i += 1) {
    currSegs = data[i].segments
    currObj = {}
    currObj.airline = currSegs[0].carrierName
    path = currSegs[0].origin
    for (let j = 0; j < currSegs.length; j += 1) {
      nextDest = " → ".concat(currSegs[j].destination)
      path = path.concat(nextDest)
    }
    currObj.path = path
    currObj.price = data[i].price
    currObj.duration = data[i].totalDuration
    retList.push(currObj)
  }
  return retList
}

// findAllOneWayFlights('DTW', 'JFK', '2023-04-04', 1)

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
      //console.log(arrList)
    }
    //printAllSourceDest(finList);
    return finList;
  } catch (e) {
    console.log(e);
  }
}


async function findDirectReturnFlights(origin, dest, departure_date, return_date, passengers) {
  results = await roundTripLookup(origin, dest, departure_date, return_date, passengers)
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
  const FileSystem = require("fs");
  FileSystem.writeFile('two_way_filtered_2.json', JSON.stringify(a), (error) => {
    if (error) throw error;
  });
  return a
}

// findDirectReturnFlights('CVG', 'EWR', '2023-04-04', '2023-05-05', 1)

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
      //console.log(curr1)
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

  // const FileSystem = require("fs");
  // FileSystem.writeFile('cross_product_filtered_2.json', JSON.stringify(retList), (error) => {
  //     if (error) throw error;
  // });
}

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

  // console.log("Writing to File")
  // const FileSystem = require("fs");
  // FileSystem.writeFile('all_rt_results.json', JSON.stringify(uniqueElements), (error) => {
  //     if (error) throw error;
  // });

  return uniqueElements;

}

// findAllRoundTripFlights('JFK', 'SFO', '2023-04-04', '2023-05-05', 1)

function removeDuplicates(array) {
  return array.filter((item, index, arr) =>
    arr.findIndex((t) => lodash.isEqual(t, item)) === index
  );
}


// crossProductRoundTrip('CVG', 'LAS', '2023-04-28', '2023-05-10', 1)
//findAllReturnFlights('PHL', 'LAX', '2023-04-04', '2023-05-05', 1)

// console.log(jsonData5.slice(0, 3), removeDuplicates(jsonData5.slice(0, 3)))
// console.log(lodash.isEqual(jsonData5[0], jsonData5[2]))

module.exports = {
  oneWayLookup,
  roundTripLookup,
  filterData,
  findAllOneWayFlights,
  findAllRoundTripFlights,
}

