import { neighborhoodStats } from "@/lib/mock";

export function NeighborhoodTable() {
  return (
    <div className="card">
      <div className="cardtitle">By neighborhood</div>
      <table>
        <thead>
          <tr>
            <th>Loop</th>
            <th>Doors/h</th>
            <th>Conv %</th>
            <th>€</th>
          </tr>
        </thead>
        <tbody>
          {neighborhoodStats.map((row) => (
            <tr key={row.loop}>
              <td>{row.loop}</td>
              <td>{row.doorsPerHour}</td>
              <td>{row.convPct}%</td>
              <td>{row.eur}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
