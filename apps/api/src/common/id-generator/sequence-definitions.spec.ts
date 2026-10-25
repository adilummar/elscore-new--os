import * as fs from 'fs';
import * as path from 'path';

import { IdGeneratorService } from './id-generator.service';
import {
  SEQUENCE_DEFINITIONS,
  sequenceUpsertArgs,
} from './sequence-definitions';

const NEXT_ID_CALL = /nextIdInTx\(\s*[^,]+,\s*('(?:[A-Z][A-Z0-9_]{0,15})'|"(?:[A-Z][A-Z0-9_]{0,15})")\s*\)/g;
const ANY_NEXT_ID_CALL = /nextIdInTx\(\s*[^,\n]+,\s*([^)\n]+)\)/g;

function walk(dir: string, files: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
}

function collectRuntimeSequenceKeys(): { keys: string[]; dynamicCalls: string[] } {
  const srcRoot = path.resolve(__dirname, '../..');
  const files: string[] = [];
  walk(srcRoot, files);

  const keys = new Set<string>();
  const dynamicCalls: string[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(NEXT_ID_CALL)) {
      keys.add(match[1].slice(1, -1));
    }
    for (const match of source.matchAll(ANY_NEXT_ID_CALL)) {
      const argument = match[1].trim();
      if (!/^['"][A-Z][A-Z0-9_]{0,15}['"]$/.test(argument)) {
        dynamicCalls.push(`${path.relative(srcRoot, file)}: ${argument}`);
      }
    }
  }

  return { keys: [...keys].sort(), dynamicCalls };
}

describe('sequence seed catalog', () => {
  const runtime = collectRuntimeSequenceKeys();

  it('represents every runtime nextIdInTx key exactly once', () => {
    expect(runtime.dynamicCalls).toEqual([]);

    const entityTypes = SEQUENCE_DEFINITIONS.map((seq) => seq.entityType);
    expect(new Set(entityTypes).size).toBe(entityTypes.length);

    const missing = runtime.keys.filter((key) => !entityTypes.includes(key));
    expect(missing).toEqual([]);
    expect(runtime.keys).toEqual(
      expect.arrayContaining(['EMP', 'ONB', 'PR', 'TPR', 'VAC', 'CAN', 'APP', 'OFF', 'CYC', 'GOL', 'REV', 'PIP']),
    );
  });

  it('keeps payroll and tutor payable identifiers on PR and TPR', () => {
    expect(SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === 'PR')).toMatchObject({
      prefix: 'PR',
      padding: 4,
    });
    expect(SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === 'TPR')).toMatchObject({
      prefix: 'TPR',
      padding: 4,
    });
    expect(SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === 'ONB')).toMatchObject({
      prefix: 'ONB',
      padding: 4,
    });
    expect(SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === 'EMP')).toMatchObject({
      prefix: 'EMP',
      padding: 4,
    });
    // Older unused keys stay addressable. They are not renamed onto the runtime keys.
    expect(SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === 'PAY')?.prefix).toBe('PAY');
    expect(SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === 'TUT')?.prefix).toBe('TUT');
  });

  it('preserves nextNumber when the same sequence definition is upserted again', () => {
    for (const seq of SEQUENCE_DEFINITIONS) {
      const first = sequenceUpsertArgs(seq);
      const second = sequenceUpsertArgs(seq);

      expect(first.update).toEqual({});
      expect(second.update).toEqual({});
      expect(first.update).not.toHaveProperty('nextNumber');
      expect(first.update).not.toHaveProperty('prefix');
      expect(first.update).not.toHaveProperty('padding');
      expect(second.update).not.toHaveProperty('nextNumber');
      expect(first.create.nextNumber).toBe(1);
      expect(second.create.nextNumber).toBe(1);
      expect(first.where).toEqual({ entityType: seq.entityType });
    }
  });

  it('formats PR, TPR, ONB, and EMP with the seeded prefix and padding', async () => {
    const service = new IdGeneratorService({} as any);

    for (const entityType of ['PR', 'TPR', 'ONB', 'EMP'] as const) {
      const definition = SEQUENCE_DEFINITIONS.find((seq) => seq.entityType === entityType);
      expect(definition).toBeDefined();
      const tx = {
        sequence: {
          update: jest.fn().mockResolvedValue({
            prefix: definition!.prefix,
            padding: definition!.padding,
            nextNumber: 2,
          }),
        },
      };

      await expect(service.nextIdInTx(tx as any, entityType)).resolves.toBe(`${entityType}-0001`);
    }
  });
});
