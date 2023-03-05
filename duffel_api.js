var axios = require('axios');

async function oneWayLookup(origin, dest, departure_date, passengers) {
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


    axios(config)
    .then(function (response) {
      const FileSystem = require("fs");
      FileSystem.writeFile('duffel_test_2.json', JSON.stringify(response.data), (error) => {
           if (error) throw error;
      });
    })
    .catch(function (error) {
      console.log(error);
    });
}

module.exports = {
    oneWayLookup
}

