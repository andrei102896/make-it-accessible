import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transcriptProblems, type StageRecord } from './key-audit.ts'

const record: StageRecord = {
  doc: 'd',
  pdfPage: 1,
  rule: 'priced',
  pdf: 'd.pdf',
  pdfSha256: '',
  wordsSha256: '',
  ledgerSha256: '',
  files: {},
  writers: { a: {}, b: {} },
}
const where = { pageDir: '/k/dev/d-p01', writer: 'a' as const, model: 'm', record }
const init = {
  type: 'system',
  subtype: 'init',
  cwd: '/k/dev/d-p01/a',
  tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  mcp_servers: [],
  model: 'm',
  permissionMode: 'dontAsk',
}
const result = { type: 'result', is_error: false, total_cost_usd: 1, num_turns: 3, permission_denials: [] }
const call = (id: string, name: string, input: Record<string, unknown>) => [
  { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x' }] } },
]

test('a clean writer run reads the evidence and its folder, writes its key and runs its check', () => {
  const lines = [
    init,
    ...call('1', 'Read', { file_path: '/k/dev/d-p01/evidence/tiles/r0c0.png' }),
    ...call('2', 'Write', { file_path: '/k/dev/d-p01/a/key.json', content: '{}' }),
    ...call('3', 'Bash', { command: '/k/dev/d-p01/a/run.sh' }),
    ...call('4', 'Grep', { pattern: 'Preis', path: '/k/dev/d-p01/evidence' }),
    result,
  ]
  assert.deepEqual(transcriptProblems(lines, where).problems, [])
})

test('the other writer, the repository, a piped command, a denial or an unfinished run discard the key', () => {
  const lines = [
    { ...init, tools: [...init.tools, 'WebFetch'] },
    ...call('1', 'Read', { file_path: '/k/dev/d-p01/b/key.json' }),
    ...call('2', 'Read', { file_path: '/k/dev/d-p01/a/../../d-p02/a/key.json' }),
    ...call('3', 'Bash', { command: '/k/dev/d-p01/a/run.sh | head -1' }),
    ...call('4', 'Write', { file_path: '/k/dev/d-p01/a/notes.md', content: '' }),
    ...call('5', 'Glob', { pattern: '../b/*' }),
    ...call('7', 'Grep', { pattern: 'x', path: '/k/dev/d-p01/evidence', glob: '../../b/*' }),
    {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: '6', name: 'Read', input: { file_path: '/k/dev/d-p01/a/key.json' } }],
      },
    },
    { ...result, permission_denials: [{}] },
  ]
  const problems = transcriptProblems(lines, where).problems.join('\n')
  for (const expected of [
    /tools .*WebFetch/,
    /b\/key.json/,
    /d-p02/,
    /run.sh \| head/,
    /notes.md/,
    /\.\.\/b/,
    /without a result/,
    /1 denied/,
  ])
    assert.match(problems, expected)
  assert.match(transcriptProblems([init], where).problems.join(), /no result event/)
})
