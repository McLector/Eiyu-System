import { STAT_COLORS, STATS, type WeeklyDayDatum } from '@eiyu/shared';

interface Props {
  data: WeeklyDayDatum[];
  timeZone: string;
}

function formatDateKey(dateKey: string, timeZone: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function alphaHex(value: number): string {
  return Math.max(0x18, Math.min(0xcc, Math.round(0x18 + value * 0x88)))
    .toString(16)
    .padStart(2, '0');
}

export default function WeeklyReviewMatrix({ data, timeZone }: Props) {
  const maxValue = Math.max(1, ...data.flatMap(day => STATS.map(stat => day[stat])));

  return (
    <div className="weekly-review-scroll">
      <table className="weekly-review-table" aria-label="Weekly activity, last 7 days">
        <caption>Weekly activity, last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">STAT</th>
            {data.map(day => {
              const dateLabel = formatDateKey(day.dateKey, timeZone);
              return (
                <th key={day.dateKey} scope="col" aria-label={`${day.day}, ${dateLabel}`}>
                  <span>{day.day}</span>
                  <time dateTime={day.dateKey}>{dateLabel.replace(', ', ' ')}</time>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {STATS.map(stat => (
            <tr key={stat}>
              <th scope="row" style={{ color: STAT_COLORS[stat] }}>
                <span aria-hidden="true">{stat}</span>
                <span className="sr-only">{stat}</span>
              </th>
              {data.map(day => {
                const value = day[stat];
                const intensity = value / maxValue;
                const dateLabel = formatDateKey(day.dateKey, timeZone);
                return (
                  <td
                    key={`${stat}-${day.dateKey}`}
                    aria-label={`${stat}, ${day.day}, ${dateLabel}: ${value} completions`}
                    data-value={value}
                    data-scale={intensity.toFixed(2)}
                    style={{
                      '--weekly-stat-color': STAT_COLORS[stat],
                      backgroundColor: `${STAT_COLORS[stat]}${alphaHex(intensity)}`,
                    } as React.CSSProperties}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { formatDateKey };
