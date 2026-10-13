const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const programId = '3jGgPRa4gH25wfL49E3TAtpix5ePUZKWrQLT83eNZBVr';
const rustDir = path.resolve(__dirname, '..');

console.log('Generating Anchor IDL for bestcrow...');
const out = execSync(
  'cargo test -p bestcrow --features idl-build -- --nocapture __anchor_private_print_idl_program',
  { cwd: rustDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
);

const startTag = '--- IDL begin program ---';
const endTag = '--- IDL end program ---';
const start = out.indexOf(startTag);
const end = out.indexOf(endTag);

if (start === -1 || end === -1) {
  console.error('Error: IDL delimiters not found in compiler output');
  process.exit(1);
}

const rawJson = out.slice(start + startTag.length, end).trim();
const idl = JSON.parse(rawJson);
idl.address = programId;

const targetDir = path.join(rustDir, 'target', 'idl');
fs.mkdirSync(targetDir, { recursive: true });

const targetFile = path.join(targetDir, 'bestcrow.json');
fs.writeFileSync(targetFile, JSON.stringify(idl, null, 2), 'utf8');

console.log(`Successfully generated ${targetFile} with ${idl.instructions.length} instructions.`);
