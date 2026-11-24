import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, longEnough, nameAllowed } from '../collector/commands.mjs';

test('parses votes, join and leave', () => {
  assert.deepEqual(parseCommand('!A'), { cmd: 'vote', arg: 'A' });
  assert.deepEqual(parseCommand('great video !b'), { cmd: 'vote', arg: 'B' });
  assert.deepEqual(parseCommand('!vote well please'), { cmd: 'vote', arg: 'well' });
  assert.deepEqual(parseCommand('!JOIN'), { cmd: 'join' });
  assert.deepEqual(parseCommand('ok !leave'), { cmd: 'leave' });
});
test('ignores look-alikes', () => {
  assert.equal(parseCommand('hello!a'), null);
  assert.equal(parseCommand('!abc'), null);
  assert.equal(parseCommand('!d'), null);
  assert.equal(parseCommand('!vote'), null);
  assert.equal(parseCommand('nice'), null);
});
test('first command wins', () => {
  assert.deepEqual(parseCommand('!B no wait !A'), { cmd: 'vote', arg: 'B' });
});
test('stone length and name filter', () => {
  assert.equal(longEnough('ok'), false);
  assert.equal(longEnough('!A '), false);
  assert.equal(longEnough('!A!'), true);
  assert.equal(longEnough('🔥🔥🔥'), true);
  const blocked = { words: ['nazi'], users: ['spammer1'] };
  assert.equal(nameAllowed('agnes_bakes', blocked), true);
  assert.equal(nameAllowed('Spammer1', blocked), false);
  assert.equal(nameAllowed('xNAZIx', blocked), false);
});
