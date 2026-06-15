export function generatePassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const buf: string[] = [];
  buf.push(upper[Math.floor(Math.random() * upper.length)]!);
  buf.push(lower[Math.floor(Math.random() * lower.length)]!);
  buf.push(digits[Math.floor(Math.random() * digits.length)]!);
  for (let i = 3; i < length; i++) {
    buf.push(all[Math.floor(Math.random() * all.length)]!);
  }
  for (let i = buf.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [buf[i], buf[j]] = [buf[j]!, buf[i]!];
  }
  return buf.join('');
}
