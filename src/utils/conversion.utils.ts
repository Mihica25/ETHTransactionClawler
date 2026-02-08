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

export function weiToEth(wei: string): string {
  try {
    const weiBigInt = BigInt(wei);
    const ethWhole = weiBigInt / BigInt(1e18);
    const weiRemainder = weiBigInt % BigInt(1e18);
    const decimalStr = weiRemainder.toString().padStart(18, '0').slice(0, 6);

    const result = `${ethWhole}.${decimalStr}`;
    return parseFloat(result).toFixed(6);
  } catch {
    const ethValue = Number(wei) / 1e18;
    return ethValue.toFixed(6);
  }
}
