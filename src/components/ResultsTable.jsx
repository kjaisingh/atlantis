export default function ResultsTable({ title, itineraries }) {
  if (itineraries.length === 0) {
    return (
      <div className="card p-4">
        <h3>{title}</h3>
        <p className="mb-0">No itineraries found for this route.</p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3>{title}</h3>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Airline</th>
              <th>Route</th>
              <th>Departs</th>
              <th>Arrives</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {itineraries.map((itinerary, index) => (
              <tr key={`${itinerary.path}-${itinerary.departureTime}-${index}`} className={index === 0 ? 'highlight-row' : ''}>
                <td>{itinerary.airline}</td>
                <td>{itinerary.path}</td>
                <td>{itinerary.departureTime}</td>
                <td>{itinerary.arrivalTime}</td>
                <td>
                  <a href={itinerary.bookingLink} target="_blank" rel="noreferrer">
                    ${itinerary.price}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
