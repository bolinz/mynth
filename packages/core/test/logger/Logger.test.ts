import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/logger/Logger.ts';

describe('Logger', () => {
  afterEach(() => {
    Logger.setLevel('info');
  });

  it('should format log messages correctly', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test');
    log.info('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO] [Test] hello'));
    spy.mockRestore();
  });

  it('should include context in output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test', { taskId: 't1' });
    log.info('working');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"taskId":"t1"'));
    spy.mockRestore();
  });

  it('should filter by level', () => {
    Logger.setLevel('warn');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test');
    log.debug('hidden');
    log.info('hidden');
    log.warn('shown');
    expect(logSpy).toHaveBeenCalledTimes(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('should create child logger', () => {
    const parent = new Logger('Parent');
    const child = parent.child('Child');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    child.info('test');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[Parent.Child]'));
    spy.mockRestore();
  });

  it('should add context via withContext', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test').withContext({ agentId: 'a1' });
    log.info('msg');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"agentId":"a1"'));
    spy.mockRestore();
  });

  it('should call console.error for error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = new Logger('Test');
    log.error('fail');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    spy.mockRestore();
  });

  it('should call console.warn for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = new Logger('Test');
    log.warn('caution');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    spy.mockRestore();
  });
});
