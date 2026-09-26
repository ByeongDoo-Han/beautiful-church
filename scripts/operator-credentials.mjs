export function operatorPassword() {
  const value = process.env.WORSHIP_TEST_PASSWORD;
  if (!value) throw new Error('Set WORSHIP_TEST_PASSWORD in your private environment before running an authenticated smoke test.');
  return value;
}
