export function tokenAmountToDecimal(rawValue: string, decimals: number): string {
  try {
    if (decimals === 0) return BigInt(rawValue).toString();

    const raw = BigInt(rawValue);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = raw / divisor;
    const remainder = raw % divisor;

    const displayDecimals = Math.min(decimals, 6);
    const decimalStr = remainder.toString().padStart(decimals, '0').slice(0, displayDecimals);

    const result = `${whole}.${decimalStr}`;
    return parseFloat(result).toFixed(displayDecimals);
  } catch {
    const value = Number(rawValue) / Math.pow(10, decimals);
    return value.toFixed(Math.min(decimals, 6));
  }
}

export function weiToEth(wei: string | bigint): string {
  try {
    const weiBigInt = typeof wei === 'bigint' ? wei : BigInt(wei);
    const divisor = 10n ** 18n;
    const whole = weiBigInt / divisor;
    const remainder = weiBigInt % divisor;
    const isNegative = weiBigInt < 0n;
    const absRemainder = remainder < 0n ? -remainder : remainder;
    const decimalStr = absRemainder.toString().padStart(18, '0').slice(0, 6);
    const sign = isNegative && whole === 0n ? '-' : '';
    return `${sign}${whole}.${decimalStr}`;
  } catch {
    const ethValue = Number(wei) / 1e18;
    return ethValue.toFixed(6);
  }
}
