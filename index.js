// Import libraries
const express = require('express');
var bodyParser = require('body-parser');
var session = require('express-session');
const lodash = require('lodash')

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

