// Imports
var db = require("./database.js");
var duffle = require("./duffel_api");
var fs = require("fs");
var bodyParser = require('body-parser');

// Initialize static data
var airports = fs.readFileSync("views/table-data.txt").toString('utf-8').split("\n");

// Routes
// GET / - displays home page
var getHome = async function (req, res) {
	var flights;

	if (req.session.data) {
		var orig = req.session.orig;
		var dest = req.session.dest;
		var dep_date = req.session.dep_date;
		var ret_date = req.session.ret_date;
		var num_adults = req.session.num_adults;
		if (ret_date) {
			flights = await duffle.findAllOneWayFlights(orig, dest, dep_date, num_adults);
		} else {
			flights[0] = await duffle.findAllRoundTripFlights(orig, dest, dep_date, ret_date, num_adults);
			flights[1] = [];
		}
	} else {
		flights = [
			[
				{
					"airline": "American Airlines",
					"path": "SFO --> PHL --> NYC",
					"duration": "6 hours 15 mins",
					"price": "$376",
				},
				{
					"airline": "United Airlines",
					"path": "SFO --> STL --> NYC",
					"duration": "6 hours 42 mins",
					"price": "$315",
				},
				{
					"airline": "Frontier Airlines",
					"path": "SFO --> NYC",
					"duration": "6 hours 2 mins",
					"price": "$502",
				},
			],
			[
				{
					"airline": "Singapore Airlines",
					"path": "NYC --> PHL --> SFO",
					"duration": "6 hours 15 mins",
					"price": "$376",
				},
				{
					"airline": "Delta Airlines",
					"path": "NYC --> STL --> SFO",
					"duration": "6 hours 42 mins",
					"price": "$315",
				},
				{
					"airline": "Sprint Airways",
					"path": "NYC --> SFO",
					"duration": "6 hours 2 mins",
					"price": "$502",
				},
			]
		];
	}

	res.render("home.ejs", { data: flights, options: airports });
};

// POST /search - searches for a given flight
var postSearch = function (req, res) {
	const obj = JSON.parse(JSON.stringify(req.body));
	req.session.data = true;

	req.session.orig = obj.orig;
	req.session.dest = obj.dest;
	req.session.dep_date = obj.dep_date;
	req.session.ret_date = obj.ret_date;
	req.session.num_adults = obj.num_adults;

	console.log(obj.ret_date);

	res.redirect("/");
}

// POST /subscribe - creates a subscription
var postSubscribe = function (req, res) {
	var source = req.body.source;
	var destination = req.body.destination;
	var date = req.body.date;
	var threshold = req.body.threshold;
	var name = req.body.name;
	var number = req.body.number;

	db.addSubscription(source, destination, date, threshold, name, number, function (err, data) {
		if (err) {
			res.redirect("/home")
		} else {
			res.send({ success: true })
		}
	})
}

// Exports
var routes = {
	get_home: getHome,
	post_search: postSearch,
	post_subscribe: postSubscribe,
};
module.exports = routes;
