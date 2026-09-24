const ALLOWED_CHARACTERS = /^[\d.\-\s]+$/;
const REPEATED_DIGITS = /^(\d)\1{10}$/;

export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

function checkDigit(digits: string): number {
  const firstWeight = digits.length + 1;
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * (firstWeight - index),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(cpf: string): boolean {
  if (!ALLOWED_CHARACTERS.test(cpf)) {
    return false;
  }

  const digits = normalizeCpf(cpf);
  if (digits.length !== 11 || REPEATED_DIGITS.test(digits)) {
    return false;
  }

  const firstCheck = checkDigit(digits.slice(0, 9));
  const secondCheck = checkDigit(digits.slice(0, 10));
  return firstCheck === Number(digits[9]) && secondCheck === Number(digits[10]);
}
