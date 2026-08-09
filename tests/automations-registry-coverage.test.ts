import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRIGGER_KEYS,
  TRIGGERS,
  TRIGGERS_BY_KEY,
  ACTION_KEYS,
  ACTIONS,
  ACTIONS_BY_KEY,
} from '../src/lib/automations/registry';

const ENGINE_SRC = readFileSync(
  join(process.cwd(), 'src', 'lib', 'automations', 'engine.ts'),
  'utf8',
);

describe('Automations registry & engine coverage', () => {
  describe('registry integrity', () => {
    it('TRIGGERS covers every TRIGGER_KEYS entry exactly once', () => {
      const keysInDefs = TRIGGERS.map((t) => t.key).sort();
      const expected = [...TRIGGER_KEYS].sort();
      expect(keysInDefs).toEqual(expected);
    });

    it('TRIGGERS_BY_KEY is exhaustive and points to matching definitions', () => {
      for (const key of TRIGGER_KEYS) {
        const def = TRIGGERS_BY_KEY[key];
        expect(def, `TRIGGERS_BY_KEY missing entry for ${key}`).toBeDefined();
        expect(def.key).toBe(key);
      }
    });

    it('ACTIONS covers every ACTION_KEYS entry exactly once', () => {
      const keysInDefs = ACTIONS.map((a) => a.key).sort();
      const expected = [...ACTION_KEYS].sort();
      expect(keysInDefs).toEqual(expected);
    });

    it('ACTIONS_BY_KEY is exhaustive and points to matching definitions', () => {
      for (const key of ACTION_KEYS) {
        const def = ACTIONS_BY_KEY[key];
        expect(def, `ACTIONS_BY_KEY missing entry for ${key}`).toBeDefined();
        expect(def.key).toBe(key);
      }
    });
  });

  describe('trigger evaluator coverage (engine.ts switch)', () => {
    for (const key of TRIGGER_KEYS) {
      it(`trigger "${key}" has a case branch in evaluateTrigger`, () => {
        const needle = `case '${key}':`;
        expect(
          ENGINE_SRC.includes(needle),
          `engine.ts is missing "${needle}" — evaluateTrigger would fall through to the compiler-implicit undefined and rule execution would silently produce no matches. Add a case branch in evaluateTrigger.`,
        ).toBe(true);
      });
    }
  });

  describe('action dispatcher coverage (runRule + resolveRecipients)', () => {
    for (const key of ACTION_KEYS) {
      it(`action "${key}" is handled somewhere in the engine`, () => {
        // Two shapes:
        //   `rule.action_key === 'send_email'` / `actionKey === 'notify_users'`
        //   or a bare literal reference inside logic that branches on it.
        const handled = ENGINE_SRC.includes(`=== '${key}'`);
        expect(
          handled,
          `engine.ts does not branch on action key "${key}". Either extend runRule/dispatchers or drop it from ACTION_KEYS. Silent no-op otherwise.`,
        ).toBe(true);
      });
    }
  });
});
