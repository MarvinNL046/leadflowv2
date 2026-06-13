/**
 * Lokale `YYYY-MM-DDTHH:mm` string voor een <input type="datetime-local">.
 * NIET via Date.toISOString() — dat geeft UTC, waardoor het veld de tijd
 * verschoven toont (10:00 lokaal → 08:00 in zomertijd).
 */
export function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
