#!/usr/bin/env node
/**
 * PreToolUse hook — กันคำสั่งที่ห้ามรัน
 *
 * บล็อก:
 *   - git commit --no-verify / -n      ข้าม hook ของ husky (commitlint, lint-staged)
 *   - sonar-scanner / pnpm sonar        ผู้ใช้เป็นคนรันเอง ตามที่ตกลงไว้
 *   - git push --force ไปที่ main/master
 *   - git checkout/restore . แบบทิ้งงานทั้ง working tree
 *
 * exit 2 = บล็อก | exit 0 = ผ่าน
 */

const RULES = [
  {
    match: /\bgit\s+commit\b[^|;&]*(--no-verify|\s-n\b)/,
    reason: [
      'ห้ามใช้ --no-verify — hook ของ git (commitlint / lint-staged) มีไว้กันของเสียเข้า repo',
      'ถ้า hook ปฏิเสธ ให้แก้ที่ต้นเหตุ ไม่ใช่ข้ามการตรวจ',
      'ถ้าติดจริงจนไปต่อไม่ได้ ให้หยุดแล้วบอกผู้ใช้ว่า hook ฟ้องอะไร',
    ].join('\n'),
  },
  {
    match: /\b(sonar-scanner|sonar\.sh)\b|\b(pnpm|npm|yarn)\s+(run\s+)?sonar\b/,
    reason: [
      'AI ไม่รัน SonarQube scan เอง — ผู้ใช้เป็นคนรันแล้วเอาผลมาให้แก้',
      'สิ่งที่ทำได้: เตรียม sonar-project.properties, generate coverage/lcov.info,',
      'แล้วบอกผู้ใช้ว่าพร้อมให้รัน scan แล้ว',
    ].join('\n'),
  },
  {
    match: /\bgit\s+push\b[^|;&]*(--force|-f\b)[^|;&]*\b(main|master)\b/,
    reason: 'ห้าม force push ไปที่ main/master — ถ้าจำเป็นจริงต้องให้ผู้ใช้ทำเอง',
  },
  {
    match: /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/,
    reason: [
      'คำสั่งนี้ทิ้งงานที่ยังไม่ commit ทั้ง working tree',
      'ถ้าตั้งใจจะย้อนไฟล์ ให้ระบุ path ของไฟล์นั้นตรง ๆ และบอกผู้ใช้ก่อน',
    ].join('\n'),
  },
];

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }
  if (!cmd) process.exit(0);

  for (const rule of RULES) {
    if (rule.match.test(cmd)) {
      process.stderr.write(`[hook: guard-bash] ${rule.reason}\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
