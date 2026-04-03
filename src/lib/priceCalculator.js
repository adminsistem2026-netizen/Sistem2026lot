/**
 * Calcula el precio de un número basado en la jerarquía:
 * 1. Si el draw_time tiene custom_price → usar ese
 * 2. Si no, usar el precio de la lotería
 *
 * @param {object} lottery - objeto de lotería con precios
 * @param {object} drawTime - objeto de hora de sorteo con precios custom
 * @param {string} number - el número ("05" o "1234")
 * @param {number} pieces - cantidad de tiempos
 * @returns {{ unitPrice: number, subtotal: number, currencySymbol: string }}
 */
export function calculatePrice(lottery, drawTime, number, pieces) {
  const isReventado = lottery.lottery_type === 'reventado';
  const is4Digits = number.length === 4;

  let unitPrice;

  if (is4Digits) {
    unitPrice = drawTime?.custom_price_4_digits
      ?? (isReventado ? lottery.reventado_price_4_digits : lottery.price_4_digits);
  } else {
    unitPrice = drawTime?.custom_price_2_digits
      ?? (isReventado ? lottery.reventado_price_2_digits : lottery.price_2_digits);
  }

  return {
    unitPrice,
    subtotal: unitPrice * pieces,
    currencySymbol: lottery.currency_symbol || '$',
  };
}

/**
 * Obtiene los multiplicadores de premios respetando la jerarquía.
 */
export function getPrizeMultipliers(lottery, drawTime) {
  return {
    first: drawTime?.custom_prize_1st_multiplier ?? lottery.prize_1st_multiplier,
    second: drawTime?.custom_prize_2nd_multiplier ?? lottery.prize_2nd_multiplier,
    third: drawTime?.custom_prize_3rd_multiplier ?? lottery.prize_3rd_multiplier,
  };
}
