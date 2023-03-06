var axios = require('axios');

async function oneWayLookup(origin, dest, departure_date, passengers) {

  console.log("Searching for flights from", origin, "to", dest);
  oneAdult = {
      "type": "adult"
    }

    var data = {
        "data": {
          "slices": [
            {
              "origin": origin,
              "destination": dest,
              "departure_date": departure_date
            }
          ],
          "passengers": [
          ],
          "cabin_class": "economy"
        }
    };

    for (let i = 0; i < passengers; i = i+1) {
        data.data.passengers.push(oneAdult);
    }    

    data = JSON.stringify(data);

    var config = {
        method: 'post',
      maxBodyLength: Infinity,
        url: 'https://api.duffel.com/air/offer_requests',
        headers: { 
          'Accept-Encoding': 'gzip', 
          'Accept': 'application/json', 
          'Duffel-Version': 'beta', 
          'Authorization': 'Bearer duffel_live_CB7c8vi41zfnvafzKqWqIXEwST_F5RG_8KwBKZsVGas', 
          'Content-Type': 'application/json'
        },
        data : data
      };


    // axios(config)
    // .then(function (response) {
    //   const FileSystem = require("fs");
    //   FileSystem.writeFile('duffel_test_3.json', JSON.stringify(response.data), (error) => {
    //        if (error) throw error;
    //   });
    //   return response.data;
    // })
    // .catch(function (error) {
    //   console.log(error);
    // });

    try {
      const response = await axios(config);
      const FileSystem = require("fs");
      FileSystem.writeFile('duffel_test_4.json', JSON.stringify(response.data), (error) => {
           if (error) throw error;
      });
      return response.data.data;
    } catch (err) {
      return err;
    }
    
}


async function roundTripLookup(origin, dest, departure_date, return_date, passengers) {

  console.log("Searching for flights from", origin, "to", dest);
  oneAdult = {
      "type": "adult"
    }

    var data = {
        "data": {
          "slices": [
            {
              "origin": origin,
              "destination": dest,
              "departure_date": departure_date,
            }, {
              "origin": dest,
              "destination": origin,
              "departure_date": return_date
            }
          ],
          "passengers": [
          ],
          "cabin_class": "economy"
        }
    };

    for (let i = 0; i < passengers; i = i+1) {
        data.data.passengers.push(oneAdult);
    }    

    data = JSON.stringify(data);

    var config = {
        method: 'post',
      maxBodyLength: Infinity,
        url: 'https://api.duffel.com/air/offer_requests',
        headers: { 
          'Accept-Encoding': 'gzip', 
          'Accept': 'application/json', 
          'Duffel-Version': 'beta', 
          'Authorization': 'Bearer duffel_live_CB7c8vi41zfnvafzKqWqIXEwST_F5RG_8KwBKZsVGas', 
          'Content-Type': 'application/json'
        },
        data : data
      };


    // axios(config)
    // .then(function (response) {
    //   const FileSystem = require("fs");
    //   FileSystem.writeFile('duffel_test_3.json', JSON.stringify(response.data), (error) => {
    //        if (error) throw error;
    //   });
    //   return response.data;
    // })
    // .catch(function (error) {
    //   console.log(error);
    // });
    
    try {
      const response = await axios(config);
      const FileSystem = require("fs");
      // FileSystem.writeFile('duffel_return_test.json', JSON.stringify(response.data), (error) => {
      //      if (error) throw error;
      // });
      return response.data.data;
    } catch (err) {
      return err;
    }
    
}

module.exports = {
    oneWayLookup,
    roundTripLookup
}

