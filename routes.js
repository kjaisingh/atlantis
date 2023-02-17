// Imports
var db = require("./database.js");

// Routes
// GET / - displays home page
var getHome = function (req, res) {
	var data = [
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

	db.addSubscription("JFK", "LAX", "1234", "250", "5", "628749832749832")
	res.render("home.ejs", { data : data });
};

// Exports
var routes = {
	get_home: getHome,
};
module.exports = routes;
