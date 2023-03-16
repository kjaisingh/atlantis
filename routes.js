// Imports
var db = require("./database.js");
var searchClient = require("./search.js");
var fs = require("fs");
var bodyParser = require('body-parser');

// Initialize static data
var airports = fs.readFileSync("views/table-data.txt").toString('utf-8').split("\n");

// Routes

/**
 * GET / : displays home page
 * @param flights: a two dimensional list 
 * 					where flights[0] contains departing flights in order of increasing price
 * 					where flights[1] contains returning flights in order of increasing price
 */
var getHome = async function (req, res) {
	var flights = []

	if (req.session.data) {
		var orig = req.session.orig;
		var dest = req.session.dest;
		var dep_date = req.session.dep_date;
		var ret_date = req.session.ret_date;
		var num_adults = req.session.num_adults;
		var name = req.session.name;
		var phone_number = req.session.phone_number;
		var price_threshold = req.session.price_threshold;
		if (!ret_date) {
			var toPush = await searchClient.findAllOneWayFlights(orig, dest, dep_date, num_adults);
			var filteredPush = searchClient.filterData(toPush);
			if (filteredPush.length > 10) {
				filteredPush = filteredPush.slice(0, 10);
			}
			flights.push(filteredPush);
			flights.push([])
		} else {
			var toPush1 = await searchClient.findAllOneWayFlights(orig, dest, dep_date, num_adults);
			var toPush2 = await searchClient.findAllOneWayFlights(dest, orig, ret_date, num_adults);
			var filteredPush1 = searchClient.filterData(toPush1);
			var filteredPush2 = searchClient.filterData(toPush2);
			if (filteredPush1.length > 10) {
				filteredPush1 = filteredPush1.slice(0, 10);
			}
			if (filteredPush2.length > 10) {
				filteredPush2 = filteredPush2.slice(0, 10);
			}
			flights.push(filteredPush1);
			flights.push(filteredPush2);
		}
	} else {
		req.session.orig = "";
		req.session.dest = "";
		req.session.dep_date = "";
		req.session.ret_date = "";
		req.session.num_adults = "";
		req.session.name = "";
		req.session.phone_number = "";
		req.session.price_threshold = "";
		flights = [[], []];
	}

	res.render("home.ejs", {
		data: flights, options: airports,
		orig: req.session.orig, dest: req.session.dest,
		dep_date: req.session.dep_date, ret_date: req.session.ret_date,
		name: req.session.name, phone_number: req.session.phone_number,
		price_threshold: req.session.price_threshold
	});
};

// POST /search - searches for a given flight
var postSearch = function (req, res) {
	const obj = JSON.parse(JSON.stringify(req.body));
	req.session.data = true;
	req.session.ret_date = "";

	req.session.orig = obj.orig;
	req.session.dest = obj.dest;
	req.session.dep_date = obj.dep_date;
	req.session.ret_date = obj.ret_date;
	req.session.num_adults = obj.num_adults;
	req.session.name = obj.name;
	req.session.phone_number = obj.phone_number;
	req.session.price_threshold = obj.price_threshold;

	res.redirect("/");
}

/**
 * POST /subscribe - creates a subscription
 * @param orig: departing airport, eg. LAX
 * @param dest: departing airport, eg. JFK
 * @param dep_date: departure date YYYY-MM-DD, eg. "2023-05-31"
 * @param ret_date: return date YYYY-MM-DD, eg. "2023-05-34" (if null, then one-way)
 * @param num_adults: the number of travelers (integer > 0), eg. 1
 * @param name: name of user, eg. "John Doe"
 * @param phone_number: mobile number of user +1-xxx-xxx-xxxx, eg +1-123-456-7890
 * @param price_threshold: price threshold under which to be notified, eg. "250"
 */
var postSubscribe = function (req, res) {
	var source = req.session.orig;
	var destination = req.session.dest;
	var number_travelers = req.session.num_adults;
	var departure_date = req.session.dep_date;
	var return_date = req.session.ret_date;
	var threshold = req.session.price_threshold;
	var name = req.session.name;
	var number = req.session.phone_number;

	db.addSubscription(source, destination, number_travelers, departure_date, return_date, threshold, name, number, function (err, data) {
		if (err) {
			res.redirect("/home");
		} else {
			res.send({ success: true });
		}
	});
}

// Exports
var routes = {
	get_home: getHome,
	post_search: postSearch,
	post_subscribe: postSubscribe,
};
module.exports = routes;
