// Imports
var AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
var db = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient()

const CacheTableName = "HiddenCities"
const SubscriptionTableName = "Subscriptions"

//--------------------------Cache Table Functions--------------------------------//

/**
 * Returns the entire Cache Table
 * For each item: "Source" is the source IATA, "Destination" is the destination IATA, and "HiddenCities" is a list of IATAs
 */
function getAllHiddenCities() {
    const params = {
        TableName: CacheTableName,
    };

    db.scan(params, function (err, data) {
        if (err) {
            console.error("Unable to find cities", err);
        } else {
            console.log(`Found ${data.Count} cities`);
            return data.Items;
        }
    });
}

/** Fetches the Cache Table for a given (source,destination) pair
 *
 * @param source: Source IATA
 * @param destination: Destination IATA
 * @returns A list of IATAs
 */
async function getHiddenCities(source, destination) {
    const params = {
        TableName: CacheTableName,
        Key: {
            Source: { S: source },
            Destination: { S: destination }
        },
    };

    return await db.getItem(params).promise()
}


//--------------------------Subscription Table Functions--------------------------------//

/**
 * Adds a subscription to the DynamoDB Subscription Table
 *
 * @param source: source IATA, eg. "LAX"
 * @param destination: destination IATA, eg. "JFK"
 * @param number_travelers: the number of travelers, eg. 1
 * @param departure_date: departure date YYYY-MM-DD, eg. "2023-05-31"
 * @param return_date: return date YYYY-MM-DD, eg. "2023-05-34" (if null, then one-way)
 * @param price_threshold: price threshold under which to be notified, eg. "250"
 * @param name: name of user, eg. "John Doe"
 * @param mobile_number: mobile number of user +1-xxx-xxx-xxxx, eg +1-123-456-7890
 */
function addSubscription(source, destination, number_travelers, departure_date, return_date, price_threshold, name, mobile_number) {
    const itinerary = source + '+' + destination + '+' + number_travelers + '+' + departure_date + '+' + (return_date ? return_date : '0');

    const params = {
        TableName: SubscriptionTableName,
        Item: {
            itinerary: { S: itinerary },
            mobile_number: { S: mobile_number },
            user: { S: name },
            price_threshold: { N: price_threshold },
        },
    };

    db.putItem(params, function (err) {
        if (err) {
            console.error("Unable to add subscription", err);
        } else {
            console.log(`Added ${itinerary} subscription with a threshold of ${price_threshold}`);
        }
    });
}

/**
 * Returns all subscriptions currently in the DynamoDB Subscription Table
 */
function getAllSubscriptions(callback) {
    const params = {
        TableName: SubscriptionTableName,
    };

    db.scan(params, function (err, data) {
        if (err) {
            console.error("Unable to find cities", err);
            callback(err)
        } else {
            console.log(`Found ${data.Count} cities`);
            callback(err, data)
        }
    });
}

/**
 * Deletes a subscription from the DynamoDB Subscription Table
 *
 * @param itinerary: the itinerary to delete, eg. "LAX+JFK+2023-05-01"
 * @param mobile_number: the mobile number used for the subscription, eg. "+1-xxx-xxx-xxxx"
 */
function deleteSubscription(itinerary, mobile_number) {
    const params = {
        TableName: SubscriptionTableName,
        Key: {
            itinerary: { S: itinerary },
            mobile_number: { S: mobile_number }
        },
    };

    db.deleteItem(params, function (err) {
        if (err) {
            console.error("Unable to find subscription", err);
        } else {
            console.log(`Deleted ${itinerary}`);
        }
    });
}


module.exports = {
    addSubscription,
    deleteSubscription,
    getAllHiddenCities,
    getAllSubscriptions,
    getHiddenCities,
};