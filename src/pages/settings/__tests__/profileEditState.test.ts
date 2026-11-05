import { describe, expect, it, vi } from 'vitest';
import { ProfileEditState } from '../profileEditState';
vi.mock('guanggu-forum-api', () => ({ getOwnProfileSettings: vi.fn(), saveOwnProfileSettings: vi.fn() }));
vi.mock('../../../utils/currentUser', () => ({ getCachedUsername: () => 'fixture' }));
const fields = () => ({ nickname: 'original', gender: '0', generation: '0', signature: '', location: '', website: '', college: '', company: '', self_intro: '' });
const draft = () => ({ username: 'fixture', email: 'fixture@example.invalid', fields: fields(), options: { gender: [{ value: '0', label: '不显示' }], generation: [{ value: '0', label: '不显示' }] } });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(get = vi.fn().mockResolvedValue(draft()), post = vi.fn()) { let account = 'fixture'; const state = new ProfileEditState(() => account, get, post); state.activate(account); return { state, get, post, changeAccount: (next: string) => { account = next; } }; }
describe('account-scoped page-local profile form', () => {
  it('keeps original opaque draft reference and independent fields, dirty comparisons include all nine fields', async () => {
    const original = draft(); const { state } = setup(vi.fn().mockResolvedValue(original)); await state.load();
    expect(state.snapshot().draft).toBe(original); expect(state.snapshot().fields).not.toBe(original.fields);
    state.change('nickname', 'changed'); expect(original.fields.nickname).toBe('original'); expect(state.snapshot().dirty).toBe(true);
    state.change('nickname', 'original'); expect(state.snapshot().dirty).toBe(false);
    state.change('self_intro', 'new intro'); expect(state.snapshot().dirty).toBe(true);
  });
  it('explicit save holds a synchronous lock, preserves the original draft and resolves only the verified result', async () => {
    const original = draft(), pending = deferred<any>(); const post = vi.fn().mockReturnValue(pending.promise); const { state } = setup(vi.fn().mockResolvedValue(original), post);
    await state.load(); state.change('location', 'fixture city'); const success = vi.fn(); const first = state.save(success); const duplicate = state.save(success);
    expect(post).toHaveBeenCalledTimes(1); expect(post.mock.calls[0][0]).toBe(original); expect(state.snapshot().saving).toBe(true);
    state.change('location', 'late change'); expect(state.snapshot().fields!.location).toBe('fixture city');
    const verified = { ...draft(), fields: { ...fields(), location: 'fixture city' } }; pending.resolve(verified); await first; await duplicate;
    expect(state.snapshot().draft).toBe(verified); expect(state.snapshot().dirty).toBe(false); expect(success).toHaveBeenCalledTimes(1);
  });
  it.each(['VERIFICATION', 'STALE_DRAFT', 'NETWORK', 'HTTP'])('unconfirmed save (%s) preserves edits, blocks another POST and requires an explicit fresh GET', async code => {
    const post = vi.fn().mockRejectedValue({ code, message: 'SECRET raw payload' }); const { state, get } = setup(undefined, post);
    await state.load(); state.change('signature', 'retain draft'); await state.save(vi.fn());
    expect(state.snapshot().fields!.signature).toBe('retain draft'); expect(state.snapshot().requiresRefresh).toBe(true); expect(state.snapshot().error).not.toContain('SECRET');
    await state.save(vi.fn()); expect(post).toHaveBeenCalledTimes(1); expect(get).toHaveBeenCalledTimes(1);
    await state.load(); expect(get).toHaveBeenCalledTimes(2); expect(state.snapshot().requiresRefresh).toBe(false);
  });
  it('account changes and hidden late GET/save completions clear visible state and cannot notify success', async () => {
    const getPending = deferred<any>(); const { state, changeAccount } = setup(vi.fn().mockReturnValue(getPending.promise)); const loading = state.load();
    changeAccount('other'); getPending.resolve(draft()); await loading; expect(state.snapshot().draft).toBeNull(); expect(state.snapshot().visible).toBe(false);
    const savePending = deferred<any>(); const second = setup(undefined, vi.fn().mockReturnValue(savePending.promise)); await second.state.load(); second.state.change('nickname', 'new');
    const success = vi.fn(); const saving = second.state.save(success); second.state.hide(); savePending.resolve(draft()); await saving;
    expect(second.state.snapshot().draft).toBeNull(); expect(success).not.toHaveBeenCalled();
  });
  it('refresh invalidates old opaque draft even when GET fails, retains dirty input and never allows stale save', async () => {
    const get = vi.fn().mockResolvedValueOnce(draft()).mockRejectedValueOnce({ code: 'NETWORK' }); const post = vi.fn(); const { state } = setup(get, post);
    await state.load(); state.change('nickname', 'retain input'); await state.load();
    expect(state.snapshot().fields!.nickname).toBe('retain input'); expect(state.snapshot().dirty).toBe(true); expect(state.snapshot().requiresRefresh).toBe(true);
    await state.save(vi.fn()); expect(post).not.toHaveBeenCalled();
  });
  it('URI-encoded legacy account accepts the API-confirmed decoded username without weakening account scope', async () => {
    const state = new ProfileEditState(() => '%E6%B5%8B%E8%AF%95', vi.fn().mockResolvedValue({ ...draft(), username: '测试' }), vi.fn());
    state.activate('%E6%B5%8B%E8%AF%95'); await state.load(); expect(state.snapshot().draft!.username).toBe('测试'); expect(state.snapshot().requiresRefresh).toBe(false);
  });
  it('fresh GET with a different own username never exposes fields or enables save', async () => {
    const { state } = setup(vi.fn().mockResolvedValue({ ...draft(), username: 'other' })); await state.load();
    expect(state.snapshot().fields).toBeNull(); expect(state.snapshot().draft).toBeNull(); expect(state.snapshot().requiresRefresh).toBe(true);
  });
});
