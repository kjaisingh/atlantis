# Atlantis

Atlantis helps compare ordinary nonstop fares with hidden-city itineraries: flights whose connection is the city you intend to visit. It shows matching Kayak searches; it does not book tickets or handle payment.

[Open Atlantis](https://atlantis-xoxe.onrender.com) · [Build status](https://github.com/kjaisingh/atlantis/actions/workflows/build.yml)

## Use it

Choose origin, destination, travel date, and number of travelers. Review prices, route, departure time, and whether each result is nonstop or hidden-city. Filter or sort results, then open the matching Kayak search to check the final itinerary and fare. Round trips are shown as separate outbound and inbound searches.

Search covers a bounded number of flight combinations, so results are not guaranteed exhaustive. Atlantis labels partial results when a provider request fails or the search budget cuts off candidates. Prices are compared only within the same currency. Price alerts appear only when database and email delivery are configured; they are currently unavailable on the live app.

## Before booking

Hidden-city tickets carry real risks. Checked bags usually continue to the ticketed destination; skipping a leg can cancel all later legs on that ticket. Airlines may reroute connections or apply fare-rule and loyalty-account restrictions. Check visa, transit, and entry rules for every airport. Confirm current price and terms on the booking site before purchase.

Maintainer setup, deployment, and database procedures: [operations guide](docs/operations.md).

MIT licensed: [LICENSE](LICENSE).
