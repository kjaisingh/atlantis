// Imports
var db = require("./database.js");
var fs = require("fs");

// Routes
// GET / - displays home page
var getHome = function (req, res) {
	var flights = [
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
	];

	var airports = fs.readFileSync("views/table-data.txt").toString('utf-8').split("\n");
	res.render("home.ejs", { data: flights, options: airports });
};

// GET /search - searches for a given flight
var getSearch = function (req, res) {

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
			res.send({success: true})
		}
	})
}

// Exports
var routes = {
	get_home: getHome,
	get_search: getSearch,
	post_subscribe: postSubscribe,
};
module.exports = routes;
