import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('server room reads share one request snapshot without sharing data between users', () => {
  execFileSync(process.execPath, ['--conditions=react-server', 'tests/fixtures/room-render.mjs'], { encoding: 'utf8' });
});
