// Imports
var axios = require('axios');
const config = require('./config.json')

/**
 * Issues a one way flight search using DuffelAPI
 * @param origin: departing airport, eg. LAX 
 * @param dest: destination airport, eg. JFK 
 * @param departure_date: departure date YYYY-MM-DD, eg. "2023-05-31"
 * @param passengers: the number of travelers (>0), eg. 1
 * @returns https://duffel.com/docs/api/v1/offers/get-offers
 */
async function oneWayLookup(origin, dest, departure_date, passengers) {
    console.log("Searching for flights from", origin, "to", dest);

    oneAdult = { "type": "adult" }
    var data = {
        "data": {
            "slices": [
                {
                    "origin": origin,
                    "destination": dest,
                    "departure_date": departure_date
                }
            ],
            "passengers": [],
            "cabin_class": "economy"
        }
    };

    for (let i = 0; i < passengers; i = i + 1) {
        data.data.passengers.push(oneAdult);
    }

    data = JSON.stringify(data);

    var config_request = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.duffel.com/air/offer_requests',
        headers: {
            'Accept-Encoding': 'gzip',
            'Accept': 'application/json',
            'Duffel-Version': 'beta',
            'Authorization': config.duffel.authorization,
            'Content-Type': 'application/json'
        },
        data: data
    };

    try {
        const response = await axios(config_request);
        return response.data.data;
    } catch (err) {
        console.log(err);
        return err;
    }

}

/**
 * Issues a one way flight search using DuffelAPI
 * @param origin: departing airport, eg. LAX 
 * @param dest: destination airport, eg. JFK 
 * @param departure_date: departure date YYYY-MM-DD, eg. "2023-05-31"
 * @param return_date: return date YYYY-MM-DD, eg. "2023-06-31"
 * @param passengers: the number of travelers (>0), eg. 1
 * @returns https://duffel.com/docs/api/v1/offers/get-offers
 */
async function roundTripLookup(origin, dest, departure_date, return_date, passengers) {
    console.log("Searching for flights from", origin, "to", dest, "and back");
    oneAdult = { "type": "adult" }

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
            "passengers": [],
            "cabin_class": "economy"
        }
    };

    for (let i = 0; i < passengers; i = i + 1) {
        data.data.passengers.push(oneAdult);
    }

    data = JSON.stringify(data);

    var config_request = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.duffel.com/air/offer_requests',
        headers: {
            'Accept-Encoding': 'gzip',
            'Accept': 'application/json',
            'Duffel-Version': 'beta',
            'Authorization': config.duffel.authorization,
            'Content-Type': 'application/json'
        },
        data: data
    };

    try {
        const response = await axios(config_request);
        console.log("Search Complete");
        return response.data.data;
    } catch (err) {
        console.log(err);
        return err;
    }
}

// Exports
module.exports = {
    oneWayLookup,
    roundTripLookup,
};