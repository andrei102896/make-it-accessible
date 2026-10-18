import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCsv, parseCsv } from './csv.ts'
import {
  byAddress,
  due,
  followUp,
  formatTargets,
  logged,
  parseTargets,
  type SentEmail,
  type Target,
} from './outreach.ts'

const HEADER = 'priority,segment,business,city,country,email,contact_form,pdf_url,tagged,hook,caveat,sent,reply'
const target = (business: string, sent = '2026-10-14', more: Partial<Target> = {}): Target => {
  const [t] = parseTargets(`${HEADER}\r\nA,uk,${business},Leeds,UK,a@${business}.test,,,,,,${sent},\r\n`)
  if (!t) throw new Error('no row')
  return { ...t, ...more }
}

test('targets.csv as Python writes it round-trips, quotes and CRLF kept; the follow-up columns are appended', () => {
  const row = 'A,uk,"Bud, Alley",Leeds,UK,a@b.test,,,,"Says ""hi"", twice",,2026-10-14,'
  const text = `${HEADER}\r\n${row}\r\n`
  assert.deepEqual(parseCsv(text)[1]?.[9], 'Says "hi", twice')
  assert.equal(formatCsv(parseCsv(text)), text)
  const saved = formatTargets(parseTargets(text))
  assert.equal(saved, `${HEADER},followup1,followup2\r\n${row},,\r\n`)
  assert.deepEqual(parseTargets(saved), parseTargets(text))
  assert.throws(() => parseTargets('business,owner\r\nx,y\r\n'), /unknown columns owner/)
})

test('follow-up 1 from day 3, follow-up 2 from day 8 and 3 days after the first; replies and bounces stop them', () => {
  const targets = [
    target('Early', '2026-10-14'),
    target('Fresh', '2026-10-17'),
    target('Auto', '2026-10-15', { reply: 'auto-reply only (booking info), 2026-10-15; not counted' }),
    target('Bounced', '2026-10-14', { reply: 'bounced 2026-10-15: address does not exist' }),
    target('Replied', '2026-10-14', { reply: '2026-10-15 Sorin: "Yes of course"' }),
    target('Late', '2026-10-14', { followup1: '2026-10-21' }),
    target('Done', '2026-10-01', { followup1: '2026-10-04', followup2: '2026-10-10' }),
  ]
  const on = (day: string): string[] => due(targets, day).map((d) => `${d.target.business} ${String(d.n)}`)
  assert.deepEqual(on('2026-10-19'), ['Early 1', 'Auto 1'])
  assert.deepEqual(on('2026-10-22'), ['Early 1', 'Auto 1', 'Fresh 1'])
  assert.deepEqual(on('2026-10-24'), ['Early 1', 'Late 2', 'Auto 1', 'Fresh 1'])
})

test('a follow-up greets and signs as the first email did, names its document, and flags what it had to guess', () => {
  const first = (body: string, to = 'a@star.test'): SentEmail => ({ to, subject: 'Star Inn menu', body })
  const uk = first(
    'Hi Adam and Anna,\n\nI had a look at your October price list. It is a PDF.\n\nBest,\nAndrew\nMake It Accessible · x',
  )
  const fu = followUp(target('Star'), uk, 1)
  assert.equal(fu.guessed, false)
  assert.match(fu.text, /^Hi Adam and Anna,\n\n.*send your October price list back.*\n\nAndrew$/)
  const shared = first('Hi team,\n\nI had a look at the evening menu you share across your five restaurants. It')
  assert.match(followUp(target('Dylan'), shared, 1).text, /your evening menu back/)
  const us = first(
    'Hi Ruth,\n\nI had a look at the menu on your website.\n\nMake It Accessible · x\nOradea, Romania\nReply STOP.',
  )
  assert.match(followUp(target('Ruth'), us, 2).text, /Last note.*\n\nAndrew\nOradea, Romania\nReply STOP\.$/)
  const guessed = followUp(target('Carew'), undefined, 1)
  assert.equal(guessed.guessed, true)
  assert.match(guessed.text, /^Hi Carew team,\n\n.*your menu back/)
  assert.match(
    followUp(target('Lab', '', { segment: 'agencies' }), first('Hi Lab team,\n\nI saw your post.'), 1).text,
    /clients/,
  )
})

test('a later batch replaces an earlier draft to the same address', () => {
  const early = { to: 'A@Lab.test', subject: 'old', body: '' }
  const late = { to: 'a@lab.test', subject: 'sent', body: '' }
  assert.equal(byAddress([[early], [late]]).get('a@lab.test')?.subject, 'sent')
})

test('a log records dates for several businesses, a reply for one, and refuses unknown names and overwrites', () => {
  const targets = [target('Star', '2026-10-14'), target('Swan', '2026-10-14')]
  const sent = logged(targets, 'followup1', '2026-10-19', ['star', 'Swan'])
  assert.deepEqual(
    sent.map((t) => t.followup1),
    ['2026-10-19', '2026-10-19'],
  )
  assert.throws(() => logged(sent, 'followup1', '2026-10-20', ['Star']), /already 2026-10-19/)
  assert.throws(() => logged(targets, 'followup1', 'today', ['Star']))
  assert.throws(() => logged(targets, 'followup1', '2026-10-19', ['Star', 'Nowhere']), /"Nowhere" matches 0/)
  assert.throws(() => logged(targets, 'reply', 'yes', ['Star', 'Swan']), /one business/)
  const replied = logged(logged(targets, 'reply', 'yes', ['Star']), 'reply', '$29 is fine', ['Star'])
  assert.equal(replied[0]?.reply, 'yes / $29 is fine')
  assert.equal(replied[1], targets[1])
})
