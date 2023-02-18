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

// Exports
var routes = {
	get_home: getHome,
};
module.exports = routes;
