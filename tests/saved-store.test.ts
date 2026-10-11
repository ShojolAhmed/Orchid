import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluateAccess } from '../src/features/auth/access.ts'
import { createSavedStore } from '../src/features/library/savedStore.ts'

function harness(over: { check?: (uris: string[]) => Promise<boolean[]>; set?: (uris: string[], saved: boolean) => Promise<void> } = {}) {
  const checks: string[][] = []
  const sets: Array<[string[], boolean]> = []
  const timers: Array<() => void> = []
  const store = createSavedStore({
    check: (uris) => (checks.push(uris), over.check ? over.check(uris) : Promise.resolve(uris.map(() => false))),
    set: (uris, saved) => (sets.push([uris, saved]), over.set ? over.set(uris, saved) : Promise.resolve()),
    schedule: (task) => void timers.push(task),
  })
  const tick = async () => {
    timers.splice(0).forEach((task) => task())
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { store, checks, sets, tick, timers }
}

describe('saved store: lookups', () => {
  it('batches many asks within one window into a single request and never asks twice', async () => {
    const h = harness({ check: (uris) => Promise.resolve(uris.map((uri) => uri === 'b')) })
    h.store.request(['a', 'b'])
    h.store.request(['b', 'c'])
    assert.equal(h.timers.length, 1)
    await h.tick()
    assert.deepEqual(h.checks, [['a', 'b', 'c']])
    assert.equal(h.store.getSnapshot().saved.get('b'), true)
    assert.equal(h.store.getSnapshot().saved.get('a'), false)
    h.store.request(['a', 'b', 'c'])
    await h.tick()
    assert.equal(h.checks.length, 1)
  })

  it('leaves unanswered items unknown (not false) and does not loop after a failed lookup', async () => {
    const h = harness({ check: () => Promise.reject(new Error('403')) })
    h.store.request(['a'])
    await h.tick()
    assert.equal(h.store.getSnapshot().saved.has('a'), false)
    assert.equal(h.store.getSnapshot().lookupFailed, true)
    h.store.request(['a'])
    await h.tick()
    assert.equal(h.checks.length, 1)
  })

  it('remember() records known state without a request', async () => {
    const h = harness()
    h.store.remember(['a'], true)
    h.store.request(['a'])
    await h.tick()
    assert.equal(h.checks.length, 0)
    assert.equal(h.store.getSnapshot().saved.get('a'), true)
  })
})

describe('saved store: toggling', () => {
  it('is not optimistic: pending first, flips only after Spotify confirmed', async () => {
    let finish: () => void = () => {}
    const h = harness({ set: () => new Promise<void>((resolve) => void (finish = resolve)) })
    h.store.remember(['a'], false)
    const done = h.store.toggle('a')
    assert.equal(h.store.getSnapshot().pending.has('a'), true)
    assert.equal(h.store.getSnapshot().saved.get('a'), false, 'still unsaved while the request runs')
    finish()
    assert.equal(await done, true)
    assert.equal(h.store.getSnapshot().saved.get('a'), true)
    assert.equal(h.store.getSnapshot().pending.has('a'), false)
    assert.deepEqual(h.sets, [[['a'], true]])
  })

  it('a failed save leaves the old state, clears pending and throws', async () => {
    const h = harness({ set: () => Promise.reject(new Error('boom')) })
    h.store.remember(['a'], false)
    await assert.rejects(h.store.toggle('a'), /boom/)
    assert.equal(h.store.getSnapshot().saved.get('a'), false)
    assert.equal(h.store.getSnapshot().pending.size, 0)
  })

  it('a second toggle while one is running is ignored (no double request)', async () => {
    let finish: () => void = () => {}
    const h = harness({ set: () => new Promise<void>((resolve) => void (finish = resolve)) })
    h.store.remember(['a'], false)
    const first = h.store.toggle('a')
    await h.store.toggle('a')
    finish()
    await first
    assert.equal(h.sets.length, 1)
  })

  it('removing sends the opposite state', async () => {
    const h = harness()
    h.store.remember(['a'], true)
    assert.equal(await h.store.toggle('a'), false)
    assert.deepEqual(h.sets, [[['a'], false]])
  })

  it('an answer that arrives after a sign-out or account change is ignored', async () => {
    let answer: (value: boolean[]) => void = () => {}
    const h = harness({ check: () => new Promise<boolean[]>((resolve) => void (answer = resolve)) })
    h.store.request(['a'])
    await h.tick()
    h.store.reset()
    answer([true])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(h.store.getSnapshot().saved.size, 0)
    h.store.request(['a'])
    assert.equal(h.timers.length, 1, 'asks again for the new account')
  })

  it('a lookup that finishes after a newer write does not overwrite it', async () => {
    let answer: (value: boolean[]) => void = () => {}
    const h = harness({ check: () => new Promise<boolean[]>((resolve) => void (answer = resolve)) })
    h.store.request(['a'])
    await h.tick()
    h.store.remember(['a'], true)
    answer([false])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(h.store.getSnapshot().saved.get('a'), true)
  })
})

describe('feature access', () => {
  const library = ['library'] as const
  it('is pending while a session is restored or exchanged', () => {
    for (const status of ['restoring', 'redirecting', 'exchanging'] as const) assert.equal(evaluateAccess(status, [], library, true).status, 'pending')
  })
  it('signed out is "signed-out", or "unconfigured" when the app has no client id', () => {
    assert.equal(evaluateAccess('signed-out', [], library, true).status, 'signed-out')
    assert.equal(evaluateAccess('signed-out', [], library, false).status, 'unconfigured')
  })
  it('signed in without the scopes asks to reconnect and names what is missing', () => {
    const access = evaluateAccess('signed-in', ['streaming'], library, true)
    assert.equal(access.status, 'reconnect')
    assert.deepEqual(access.status === 'reconnect' ? access.missing : [], ['user-library-modify', 'user-library-read'])
  })
  it('is granted only when every scope of the requested features is held; profile needs none', () => {
    assert.equal(evaluateAccess('signed-in', ['user-library-read', 'user-library-modify'], library, true).status, 'granted')
    assert.equal(evaluateAccess('signed-in', [], ['profile'], true).status, 'granted')
    assert.equal(evaluateAccess('signed-in', ['user-library-read'], library, true).status, 'reconnect')
  })
})
