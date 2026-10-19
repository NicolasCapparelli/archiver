// A local display boundary only. Never changes archive records or their context.
export interface CalculatorVisibility { through: number; exceptions: string[] }
interface Row { id: string; timestamp: number }
export const visibilityKey = "archiver.calculator.visibility.v1";
export function readVisibility(raw: string | null): CalculatorVisibility {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value && Number.isFinite(value.through) && value.through >= 0 && Array.isArray(value.exceptions) && value.exceptions.every((id: unknown) => typeof id === "string")) return value;
  } catch { /* Missing or damaged preferences must not hide history. */ }
  return { through: 0, exceptions: [] };
}
export function isCalculationVisible(row: Row, visibility: CalculatorVisibility): boolean {
  return row.timestamp > visibility.through || visibility.exceptions.includes(row.id);
}
export function clearVisibleCalculations(rows: Row[], now: number): CalculatorVisibility {
  return { through: rows.reduce((latest, row) => Math.max(latest, row.timestamp), now), exceptions: [] };
}
export function revealNewCalculation(row: Row, visibility: CalculatorVisibility): CalculatorVisibility {
  // Also handles equal millisecond timestamps and a system clock moving backwards.
  return row.timestamp > visibility.through ? visibility : { ...visibility, exceptions: [...new Set([...visibility.exceptions, row.id])] };
}
