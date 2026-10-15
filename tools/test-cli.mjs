import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
const env = {...process.env, PATH: `${path.join(homedir(), '.cargo', 'bin')}${path.delimiter}${process.env.PATH}`, CARGO_TARGET_DIR:path.resolve('target')};
const build = spawnSync('cargo', ['build','--manifest-path','src-tauri/Cargo.toml','--bin','archiverctl'], {env,stdio:'inherit'});
if (build.status !== 0) process.exit(build.status ?? 1);
const test = spawnSync(process.execPath,['--test','tools/cli.test.mjs'],{env,stdio:'inherit'});
process.exit(test.status ?? 1);
