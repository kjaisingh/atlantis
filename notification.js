// Import modules
const searchClient = require('./search.js');
const twilioClient = require('./twilio-client.js');
var db = require("./database.js");

/**
 * Iterates through entire Subscription Table.
 * If a desired flight's departure date has expired, the subscription is removed from the table.
 * Otherwise, it finds the cheapest flight for the given subscription.
 * If the price is cheaper than the given threshold, a Twilio text notification is sent and the subscription is deleted.
 */
function handleSubscriptions() {
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

                twilioClient.sendTextNotification(notif, entry.mobile_number.S);
                db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
            } else if (!return_date) {
                searchClient.findAllOneWayFlights(split[0], split[1], split[3], split[2]).then(results => {
                    old_split = entry.itinerary.S.split('+');
                    filtered_results = searchClient.filterData(results);
                    if (filtered_results[0].price < parseFloat(entry.price_threshold.N)) {
                        notif = `Hi ${entry.user.S}!\n\n`;
                        notif += `We found a flight from that is less than your threshold of $${entry.price_threshold.N}!\n\n`;
                        if (old_split[2] == '1') {
                            notif += `The flight costs $${filtered_results[0].price}, is operated by ${filtered_results[0].airline} and follows this path: ${filtered_results[0].path}\n\n`;
                        } else {
                            notif += `For ${old_split[2]} travelers, the total cost is $${filtered_results[0].price}. The flight is operated by ${filtered_results[0].airline} and follows this path: ${filtered_results[0].path}\n\n`;
                        }
                        notif += `Thanks for being an Atlantis customer!`;

                        twilioClient.sendTextNotification(notif, entry.mobile_number.S);
                        db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
                    }
                })
            } else {
                searchClient.findAllOneWayFlights(split[0], split[1], split[3], split[2]).then(depart_results => {
                    filtered_depart_results = searchClient.filterData(depart_results);
                    searchClient.findAllOneWayFlights(split[1], split[0], split[4], split[2]).then(return_results => {
                        old_split = entry.itinerary.S.split('+');
                        filtered_return_results = searchClient.filterData(return_results);
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

                            twilioClient.sendTextNotification(notif, entry.mobile_number.S);
                            db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
                        }
                    })
                })
            }
        })
    })
}

module.exports = {
    handleSubscriptions,
};