import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { scheduleDebouncedSave } from '../src/components/ScriptEditor.js';

describe('ScriptEditor',()=>{
  it('debounces exact markdown saves for 700ms',async()=>{
    vi.useFakeTimers();const onSave=vi.fn(async()=>undefined);
    const exact='第一行\r\n\r\n  缩进\n尾行\n';
    scheduleDebouncedSave(null,exact,onSave);
    await act(async()=>{vi.advanceTimersByTime(699);});expect(onSave).not.toHaveBeenCalled();
    await act(async()=>{vi.advanceTimersByTime(1);});expect(onSave).toHaveBeenCalledWith(exact);
    vi.useRealTimers();
  });
});
