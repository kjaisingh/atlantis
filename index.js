// Import libraries
const express = require('express');
var bodyParser = require('body-parser');
var session = require('express-session');
const lodash = require('lodash')
const duffelClient = require('./duffel-client.js')

// Import modules
const routes = require('./routes.js');
const notificationClient = require('./notification.js');

// Express initialization
const app = express();

// Routes initialization
app.use('/public', express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'mysecret' }));

// Routes declaration
app.get('/', routes.get_home);
app.post('/search', routes.post_search);
app.post('/subscribe', routes.post_subscribe);

// Initialize server
const port = 3000;
const server = app.listen(port, () => {
	console.log(`Now listening on port ${port}`);
	// notificationClient.handleSubscriptions();

	// Comment this in to constantly refresh and notify
	// setInterval(notificationClient.handleSubscriptions, 60 * 1000) // 60seconds
});

async function fetchData(origin, zArray, dep_date, num_adults) {
    const promises = zArray.map(arg => duffelClient.oneWayLookup(origin, arg, dep_date, num_adults));
    const results = await Promise.all(promises);
	return results
}

//fetchData('JFK', ['DTW', 'ATL', 'TPA'], '2023-04-04', 1)

