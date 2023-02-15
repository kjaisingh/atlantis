// Imports
const express = require('express');
const routes = require('./routes.js');
const api = require('./api.js');
const cacheTable = require('./modified.json');
const sleep = require('sleep');


// Express initialization
const app = express();

async function findAllFlights(origin, dest, date, num_adults) {
	try {

		const requisiteRow = cacheTable.filter(function (entry) {
			return entry.X === origin && entry.Y == dest;
		});

		const zArrayFromRow = requisiteRow[0].Z;
		var results = []
		const directSearch = await api.oneWaySearch(origin, dest, date, num_adults);
		results = results.concat(directSearch);
		for (let i = 0; i < zArrayFromRow.length; i++) {
			const res = await api.oneWaySearch(origin, zArrayFromRow[i], date, num_adults);
			const filtered = filterJSONResult(res, dest)
			results = results.concat(filtered);
		}

		return results;
	} catch (e) {
		console.log(e);
		return e;
	}
}

function printAllSourceDest(data) {
	for (let i = 0; i < data.length; i++) {
		const curr = data[i].itineraries[0].segments;
		arrList = []
		for(let j = 0; j < curr.length; j++) {
			const dep = curr[j].departure.iataCode;
			const arr = curr[j].arrival.iataCode;
			console.log("DEP:", dep);
			console.log("ARR:", arr);
		}
		console.log();
	  }
}

function filterJSONResult(dataToFilter, dest) {

	try {
		var finList = []
		for (let i = 0; i < dataToFilter.length; i++) {
			const curr = dataToFilter[i].itineraries[0].segments;
			var arrList = []
			for(let j = 0; j < curr.length; j++) {
				const arr = curr[j].arrival.iataCode;
				arrList.push(arr);
			}
			if (arrList.includes(dest)) {
				finList = finList.concat(dataToFilter[i]);
			}
		  }
		  return finList;
	} catch (e) {	
		console.log(e);
	}
}



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



function asyncSubJob() { 
	console.log('Starting subscription job')

	console.log('Finished subscription job')

}

// Routes declaration
app.use('/public', express.static('public'));
app.use('/', routes.get_home);

// Initialize server
const port = 3000;
const server = app.listen(port, () => {
	console.log(`Now listening on port ${port}`);
	setInterval(asyncSubJob, 60 * 1000) // 60seconds
});

