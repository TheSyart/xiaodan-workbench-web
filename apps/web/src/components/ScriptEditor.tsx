import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export function scheduleDebouncedSave(previous: ReturnType<typeof setTimeout>|null, value:string, save:(value:string)=>Promise<void>){
  if(previous)clearTimeout(previous);return setTimeout(()=>void save(value),700);
}
interface Props {
  value: string;
  onChange(value: string): void;
  onSave(value: string): Promise<void>;
  onSelectionChange?(from: number, to: number): void;
  saveState: SaveState;
}

export function ScriptEditor({ value, onChange, onSave, onSelectionChange, saveState }: Props) {
  const hostRef=useRef<HTMLDivElement>(null);const viewRef=useRef<EditorView|null>(null);
  const saveRef=useRef(onSave);const changeRef=useRef(onChange);const selectionRef=useRef(onSelectionChange);
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);const applyingExternal=useRef(false);
  saveRef.current=onSave;changeRef.current=onChange;selectionRef.current=onSelectionChange;

  useEffect(()=>{
    if(!hostRef.current)return;
    const saveNow=()=>{if(timerRef.current)clearTimeout(timerRef.current);void saveRef.current(viewRef.current?.state.doc.toString()??'');return true;};
    const view=new EditorView({parent:hostRef.current,state:EditorState.create({doc:value,extensions:[
      lineNumbers(),highlightActiveLine(),drawSelection(),history(),markdown(),
      keymap.of([{key:'Mod-s',run:saveNow},...defaultKeymap,...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({blur:()=>{saveNow();return false;}}),
      EditorView.updateListener.of((update)=>{
        if(update.selectionSet){const main=update.state.selection.main;selectionRef.current?.(main.from,main.to);}
        if(!update.docChanged||applyingExternal.current)return;
        const next=update.state.doc.toString();changeRef.current(next);
        timerRef.current=scheduleDebouncedSave(timerRef.current,next,saveRef.current);
      }),
      EditorView.theme({
        '&':{height:'100%',fontSize:'18px',background:'transparent'},
        '.cm-scroller':{fontFamily:'var(--font-writing)',lineHeight:'1.9',padding:'48px 40px 120px'},
        '.cm-content':{maxWidth:'780px',margin:'0 auto',caretColor:'var(--accent)'},
        '.cm-gutters':{background:'transparent',border:'none',color:'var(--text-faint)',paddingTop:'48px'},
        '.cm-activeLine,.cm-activeLineGutter':{background:'color-mix(in srgb, var(--accent) 6%, transparent)'},
        '.cm-selectionBackground':{background:'color-mix(in srgb, var(--accent) 18%, transparent)!important'},
        '&.cm-focused':{outline:'none'}
      })
    ]})});
    viewRef.current=view;return()=>{if(timerRef.current)clearTimeout(timerRef.current);view.destroy();viewRef.current=null;};
  },[]);

  useEffect(()=>{const view=viewRef.current;if(!view)return;const current=view.state.doc.toString();if(current===value)return;
    applyingExternal.current=true;view.dispatch({changes:{from:0,to:current.length,insert:value}});applyingExternal.current=false;
  },[value]);

  return <div className="editor-frame" data-save-state={saveState} ref={hostRef} aria-label="稿件正文编辑器" />;
}
