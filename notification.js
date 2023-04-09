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
                    minResult = parseFloat(results[0].price) < parseFloat(results[1].price) ? results[0] : results[1];
                    if (parseFloat(minResult.price) < parseFloat(entry.price_threshold.N)) {
                        notif = `Hi ${entry.user.S}!\n\n`;
                        notif += `We found a flight from that is less than your threshold of $${entry.price_threshold.N}!\n\n`;
                        if (old_split[2] == '1') {
                            notif += `The flight costs $${minResult.price}, is operated by ${minResult.airline} and follows this path: ${minResult.path}\n\n`;
                        } else {
                            notif += `For ${old_split[2]} travelers, the total cost is $${minResult.price}. The flight is operated by ${minResult.airline} and follows this path: ${minResult.path}\n\n`;
                        }
                        notif += `Here\'s a booking link: ${minResult.bookingLink}\n\n`;
                        notif += `Thanks for being an Atlantis customer!`;

                        twilioClient.sendTextNotification(notif, entry.mobile_number.S);
                        db.deleteSubscription(entry.itinerary.S, entry.mobile_number.S);
                    }
                })
            } else {
                searchClient.findAllOneWayFlights(split[0], split[1], split[3], split[2]).then(depart_results => {
                    searchClient.findAllOneWayFlights(split[1], split[0], split[4], split[2]).then(return_results => {
                        old_split = entry.itinerary.S.split('+');
                        minDepart = parseFloat(depart_results[0].price) < parseFloat(depart_results[1].price) ? depart_results[0] : depart_results[1];
                        minReturn = parseFloat(return_results[0].price) < parseFloat(return_results[1].price) ? return_results[0] : return_results[1];
                        total_price = parseFloat(minDepart.price) + parseFloat(minReturn.price)
                        if (total_price < parseFloat(entry.price_threshold.N)) {
                            notif = `Hi ${entry.user.S}!\n\n`;
                            notif += `We found a roundtrip flight from that is less than your threshold of $${entry.price_threshold.N}!\n\n`;
                            if (old_split[2] == '1') {
                                notif += `The flight costs $${total_price} in total.\n\n`;
                            } else {
                                notif += `For ${old_split[2]} travelers, the total cost is $${total_price}.\n\n`;
                            }
                            notif += `The departing flight is operated by ${minDepart.airline} and follows this path: ${minDepart.path}\n\n`;
                            notif += `Here\'s the booking link: ${minDepart.bookingLink}\n\n`;
                            notif += `The returning flight is operated by ${minReturn.airline} and follows this path: ${minReturn.path}\n\n`;
                            notif += `Here\'s the booking link: ${minReturn.bookingLink}\n\n`;
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