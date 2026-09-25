import { describe, it } from 'node:test'
import assert from 'node:assert'

import { Account } from '../../src/models/account'
import { IAPIEmail } from '../../src/lib/api'
import { getMyEmailAddresses, isMyEmail } from '../../src/lib/home/scan'

function createEmail(address: string): IAPIEmail {
  return { email: address, verified: true, primary: true, visibility: null }
}

function account(login: string, addresses: ReadonlyArray<string>): Account {
  return new Account(
    login,
    'https://api.github.com',
    'deadbeef',
    addresses.map(createEmail),
    '',
    1,
    login,
    'free'
  )
}

describe('Home scan', () => {
  describe('#getMyEmailAddresses', () => {
    it('collects every address and login we know about', () => {
      const emails = getMyEmailAddresses([
        account('octocat', ['octocat@github.com', 'OctoCat@example.com']),
      ])

      assert.ok(emails.has('octocat@github.com'))
      assert.ok(emails.has('octocat@example.com'))
      assert.ok(emails.has('octocat'))

      // Everything is folded to lower case so that matching is forgiving.
      assert.ok(!emails.has('OctoCat@example.com'))
    })

    it('is empty when nobody is signed in', () => {
      assert.equal(getMyEmailAddresses([]).size, 0)
    })
  })

  describe('#isMyEmail', () => {
    it('matches on the address itself, ignoring case', () => {
      const mine = getMyEmailAddresses([account('octocat', ['Me@GitHub.com'])])

      assert.ok(isMyEmail('me@github.com', mine))
      assert.ok(isMyEmail('ME@GITHUB.COM', mine))
      assert.ok(!isMyEmail('you@github.com', mine))
    })

    it('recognizes the plain noreply address for a login', () => {
      const mine = getMyEmailAddresses([account('octocat', [])])

      assert.ok(isMyEmail('octocat@users.noreply.github.com', mine))
      assert.ok(!isMyEmail('someone@users.noreply.github.com', mine))
    })

    it('recognizes the id prefixed noreply address for a login', () => {
      const mine = getMyEmailAddresses([account('octocat', [])])

      assert.ok(isMyEmail('1234567+octocat@users.noreply.github.com', mine))
    })

    it('matches a noreply address that we were given as an email', () => {
      const mine = getMyEmailAddresses([
        account('octocat', ['5+octocat@users.noreply.github.com']),
      ])

      assert.ok(isMyEmail('5+octocat@users.noreply.github.com', mine))
      assert.ok(isMyEmail('9+octocat@users.noreply.github.com', mine))
    })

    it('never claims a commit for an anonymous viewer', () => {
      const mine = getMyEmailAddresses([Account.anonymous()])

      assert.ok(!isMyEmail('somebody@example.com', mine))
    })

    it('is false for everything when there is nothing to match against', () => {
      assert.ok(!isMyEmail('somebody@example.com', new Set()))
      assert.ok(!isMyEmail('somebody', new Set()))
    })

    it('tolerates addresses that are not email addresses at all', () => {
      const mine = getMyEmailAddresses([account('Octo Cat', ['weird'])])

      assert.ok(isMyEmail('weird', mine))
      assert.ok(!isMyEmail('Some Body <nobody>', mine))
    })
  })
})
