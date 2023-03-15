// Import libraries
const express = require('express');
var bodyParser = require('body-parser');
var session = require('express-session');
const lodash = require('lodash')

// Import modules
const routes = require('./routes.js');
const api = require('./api.js');
const duffel = require('./duffel_api.js');
var db = require("./database.js");

// Express initialization
const app = express();

/**
 * Iterates through entire Subscription Table.
 * If a desired flight's date has expired, the subscription is removed from the table.
 * Otherwise, it finds the cheapest flight for the given subscription.
 * If the price is cheaper than the given threshold, a Twilio text notification is sent and the subscription is deleted.
 */
function asyncSubscribeJob() {
	console.log('Starting subscription job');
	db.getAllSubscriptions(function (err, data) {
		data.Items.forEach(entry => {
			split = entry.itinerary.S.split('+');
			departure_date = Date.parse(split[3]);
			return_date = (split[4] == '0') ? null : Date.parse(split[4]);

			if (departure_date < Date.parse(new Date().toISOString().split('T')[0])) {
				console.log('deleting subscription from the table');
				notif = `Hi ${entry.user.S}!\n\n`;
				notif += `Unfortunately, the price of your desired trip for ${split[2]} travelers from ${split[0]} to ${split[1]} departing on ${split[3]} never fell below your threshold of $${entry.price_threshold.N}.\n\n`;
				notif += `Thanks for being an Atlantis customer!`;

				api.sendTxtNotif(notif, entry.mobile_number.S);
				db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
			} else if (!return_date) {
				duffel.findAllOneWayFlights(split[0], split[1], split[3], split[2]).then(results => {
					old_split = entry.itinerary.S.split('+');
					filtered_results = duffel.filterData(results);
					if (filtered_results[0].price < parseFloat(entry.price_threshold.N)) {
						notif = `Hi ${entry.user.S}!\n\n`;
						notif += `We found a flight from that is less than your threshold of $${entry.price_threshold.N}!\n\n`;
						if (old_split[2] == '1') {
							notif += `The flight costs $${filtered_results[0].price}, is operated by ${filtered_results[0].airline} and follows this path: ${filtered_results[0].path}\n\n`;
						} else {
							notif += `For ${old_split[2]} travelers, the total cost is $${filtered_results[0].price}. The flight is operated by ${filtered_results[0].airline} and follows this path: ${filtered_results[0].path}\n\n`;
						}
						notif += `Thanks for being an Atlantis customer!`;

						api.sendTxtNotif(notif, entry.mobile_number.S);
						db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
					}
				})
			} else {
				duffel.findAllOneWayFlights(split[0], split[1], split[3], split[2]).then(depart_results => {
					filtered_depart_results = duffel.filterData(depart_results);
					duffel.findAllOneWayFlights(split[1], split[0], split[4], split[2]).then(return_results => {
						old_split = entry.itinerary.S.split('+');
						filtered_return_results = duffel.filterData(return_results);
						total_price = parseFloat(filtered_depart_results[0].price) + parseFloat(filtered_return_results[0].price)
						if (total_price < parseFloat(entry.price_threshold.N)) {
							notif = `Hi ${entry.user.S}!\n\n`;
							notif += `We found a roundtrip flight from that is less than your threshold of $${entry.price_threshold.N}!\n\n`;
							if (old_split[2] == '1') {
								notif += `The flight costs $${total_price} in total.\n\n`;
							} else {
								notif += `For ${old_split[2]} travelers, the total cost is $${total_price}.\n\n`;
							}
							notif += `The departing flight is operated by ${filtered_depart_results[0].airline} and follows this path: ${filtered_depart_results[0].path}\n\n`;
							notif += `The returning flight is operated by ${filtered_return_results[0].airline} and follows this path: ${filtered_return_results[0].path}\n\n`;
							notif += `Thanks for being an Atlantis customer!`;

							api.sendTxtNotif(notif, entry.mobile_number.S);
							db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
						}
					})
				})
			}
		})
	})
}

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
	asyncSubscribeJob()

	// Comment this in to constantly refresh and notify
	// setInterval(asyncSubscribeJob, 60 * 1000) // 60seconds
});

