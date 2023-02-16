// Imports
var AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
var db = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient()

const CacheTableName = "HiddenCities"
const SubscriptionTableName = "Subscriptions"

// Cache Table Functions

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

async function testGetCity() {
    x = await getHiddenCities("JFK", "LAX");
    console.log(x.Item);
}

// Subscription Table Functions

function addSubscription(source, destination, date, price_threshold, name, mobile_number) {
    const today = new Date().toISOString().split('T')[0]; // format is "2016-02-18"

    const itinerary = source + '+' + destination + '+' + date
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

async function test() {
    data = await scanSubscriptionTable();
    console.log(data);
}


module.exports = {
    addSubscription,
    deleteSubscription,
    getAllHiddenCities,
    getAllSubscriptions,
    getHiddenCities,
    // scanSubscriptionTable,
    test,
    testGetCity,
};