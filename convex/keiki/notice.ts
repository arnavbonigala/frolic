const SALT = "frolic-notice-v1|";

export function noticeToken(apiKey: string): string {
  const input = SALT + apiKey;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code + i, 0x85ebca6b) >>> 0;
  }
  const second = (a: number) => {
    let x = a;
    for (let i = 0; i < 16; i++) x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) >>> 0;
    return x;
  };
  return (second(a).toString(16) + second(b).toString(16)).padStart(16, "0").slice(0, 16);
}

export function fence(token: string): string {
  return "FROLIC-OPS " + token;
}
