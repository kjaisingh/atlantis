// Imports
const express = require('express');
const routes = require('./routes.js');
const api = require('./api.js');
const cacheTable = require('./modified.json');


// Express initialization
const app = express();

async function findAllDestinations(origin, dest, date, num_adults) {
	try {

		const requisiteRow = cacheTable.filter(function (entry) {
			return entry.X === origin && entry.Y == dest;
		});

		const zArrayFromRow = requisiteRow[0].Z;
		const directSearch = await api.oneWaySearch(origin, dest, date, num_adults);
		const results = [directSearch];
		for (let i = 0; i < zArrayFromRow.length; i++) {
			const res = await api.oneWaySearch(origin, zArrayFromRow[i], date, num_adults);
			results.push(res);
		}
		return filterResults(results);

	} catch (e) {
		console.log(e);
		return e;
	}
}

function filterResults(results) {
	return results[0];
}

findAllDestinations('ABR', 'MSP', '2023-05-01', '2').then(result => 
	{
		console.log(result);
	}).catch(err => {
		console.log(err);
	})

// function manipulateJSON() {

// 	try {
// 		for (let i = 0; i < jsonData.length; i++) {
// 			const curr = jsonData[i];
// 			z_array = curr.Z.split(",");
// 			jsonData[i].Z = z_array;
// 			console.log(jsonData[i]);
// 		  }
// 		const FileSystem = require("fs");
// 		FileSystem.writeFile('modified.json', JSON.stringify(jsonData), (error) => {
// 			 if (error) throw error;
// 		});
// 	} catch (e) {	
// 	}
// }


// Routes declaration
app.use('/public', express.static('public'));
app.use('/', routes.get_home);


// Initialize server
const port = 3000;
const server = app.listen(port, () => {
	console.log(`Now listening on port ${port}`);
});
