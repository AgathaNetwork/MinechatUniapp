const fs = require('fs');
const path = require('path');

function toIsoWithOffset(d) {
  // 保留本地时区偏移的 ISO 字符串（如 2026-01-10T12:34:56+08:00）
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());

  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const abs = Math.abs(tzMin);
  const tzH = pad(Math.floor(abs / 60));
  const tzM = pad(abs % 60);

  return `${year}-${month}-${day}T${hour}:${min}:${sec}${sign}${tzH}:${tzM}`;
}

function main() {
  const now = new Date();
  const out = {
    buildTimeIso: toIsoWithOffset(now),
    buildTimestamp: now.getTime(),
  };

  const outFile = path.resolve(__dirname, '..', 'src', 'build-info.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');

  process.stdout.write(`[build-info] wrote ${outFile}: ${out.buildTimeIso}\n`);
}

main();
