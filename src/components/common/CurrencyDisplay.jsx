/**
 * Muestra un monto con el símbolo de moneda correcto.
 * Ejemplos:
 *   <CurrencyDisplay amount={15.50} symbol="B/." /> → "B/.15.50"
 *   <CurrencyDisplay amount={1500} symbol="₡" decimals={0} /> → "₡1,500"
 */
export default function CurrencyDisplay({ amount, symbol = '$', decimals = 2, className = '' }) {
  const formatted = Number(amount).toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span className={className}>{symbol}{formatted}</span>;
}
