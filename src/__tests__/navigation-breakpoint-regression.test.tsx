import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MvpHeader from '@/components/layout/MvpHeader';

vi.unmock('react-router-dom');
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:null,loading:false,authError:null,signOut:vi.fn()})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({clear:vi.fn()})}));
vi.mock('@/lib/loop-draft-memory',()=>({clearLoopWorkingDraft:vi.fn()}));

let width=900,motion=true,legacy=false;
const listeners=new Set<(event:MediaQueryListEvent)=>void>();
const add=vi.fn((_:string,listener:(event:MediaQueryListEvent)=>void)=>listeners.add(listener));
const remove=vi.fn((_:string,listener:(event:MediaQueryListEvent)=>void)=>listeners.delete(listener));
const legacyAdd=vi.fn((listener:(event:MediaQueryListEvent)=>void)=>listeners.add(listener));
const legacyRemove=vi.fn((listener:(event:MediaQueryListEvent)=>void)=>listeners.delete(listener));
const desktop={media:'(min-width: 960px)',get matches(){return width>=960;},get addEventListener(){return legacy?undefined:add;},get removeEventListener(){return legacy?undefined:remove;},addListener:legacyAdd,removeListener:legacyRemove,dispatchEvent:()=>true,onchange:null};
beforeEach(()=>{
  width=900;motion=true;legacy=false;listeners.clear();vi.clearAllMocks();window.localStorage.clear();
  document.body.style.overflow='';document.documentElement.style.overflow='';
  vi.stubGlobal('matchMedia',vi.fn((query:string)=>query==='(min-width: 960px)'?desktop:{media:query,matches:query==='(prefers-reduced-motion: no-preference)'&&motion,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));
});
afterEach(()=>{cleanup();document.body.style.overflow='';document.documentElement.style.overflow='';vi.unstubAllGlobals();});
function show(priorInert=false){
  const view=render(<StrictMode><MemoryRouter><MvpHeader/><div id="main-content"><h1>Jobvance page</h1></div><footer>Footer</footer></MemoryRouter></StrictMode>);
  if(priorInert){document.getElementById('main-content')!.setAttribute('inert','');document.querySelector('footer')!.setAttribute('inert','');}
  return view;
}
function open(){const toggle=screen.getByRole('button',{name:'Open navigation'});fireEvent.click(toggle);expect(toggle).toHaveAttribute('aria-expanded','true');return toggle;}
function resize(next:number){act(()=>{const before=width>=960;width=next;if(before!==(width>=960))for(const listener of [...listeners])listener({matches:width>=960,media:desktop.media} as MediaQueryListEvent);});}
function unlocked(){expect(document.getElementById('main-content')).not.toHaveAttribute('inert');expect(document.querySelector('footer')).not.toHaveAttribute('inert');}

describe('mobile menu state follows its desktop breakpoint',()=>{
  it('starts closed on desktop without changing prior scrolling styles',()=>{
    width=1280;document.body.style.overflow='auto';document.documentElement.style.overflow='clip';show();
    expect(screen.getByRole('button',{name:'Open navigation'})).toHaveAttribute('aria-expanded','false');
    expect(document.body.style.overflow).toBe('auto');expect(document.documentElement.style.overflow).toBe('clip');unlocked();
  });
  it('still opens as a narrow modal and restores focus/scroll on Escape',()=>{
    show();const toggle=open();expect(document.body.style.overflow).toBe('hidden');expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.getElementById('main-content')).toHaveAttribute('inert');expect(document.querySelector('footer')).toHaveAttribute('inert');
    fireEvent.keyDown(document,{key:'Escape'});expect(toggle).toHaveAttribute('aria-expanded','false');expect(toggle).toHaveFocus();unlocked();
  });
  it('releases the modal and close-animation state at 960px, preserving prior overflow',()=>{
    document.body.style.overflow='auto';document.documentElement.style.overflow='clip';show();const toggle=open();resize(960);
    expect(toggle).toHaveAttribute('aria-expanded','false');unlocked();expect(document.body.style.overflow).toBe('auto');expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.getElementById('mobile-navigation')).not.toHaveAttribute('data-state','closing');expect(document.querySelector('.jv-menu-scrim')).toBeNull();
  });
  it('does not resurrect the old open menu when returning to 390px',()=>{
    show();const toggle=open();resize(1280);resize(390);expect(toggle).toHaveAttribute('aria-expanded','false');unlocked();
    fireEvent.click(toggle);expect(toggle).toHaveAttribute('aria-expanded','true');expect(document.body.style.overflow).toBe('hidden');
  });
  it('cleans the breakpoint listener and active modal on unmount',()=>{
    document.body.style.overflow='scroll';document.documentElement.style.overflow='auto';const view=show();open();expect(listeners.size).toBe(1);view.unmount();
    expect(listeners.size).toBe(0);expect(remove).toHaveBeenCalled();expect(document.body.style.overflow).toBe('scroll');expect(document.documentElement.style.overflow).toBe('auto');
  });
  it('does not remove inert attributes that predated its own menu',()=>{
    show(true);open();resize(1280);expect(screen.getByRole('button',{name:'Open navigation'})).toHaveAttribute('aria-expanded','false');
    expect(document.getElementById('main-content')).toHaveAttribute('inert');expect(document.querySelector('footer')).toHaveAttribute('inert');expect(document.body.style.overflow).toBe('');
  });
  it('releases the same modal under reduced motion without a closing layer',()=>{
    motion=false;show();const toggle=open();resize(1280);expect(toggle).toHaveAttribute('aria-expanded','false');unlocked();
    expect(document.querySelector('.jv-menu-scrim')).toBeNull();expect(document.getElementById('mobile-navigation')).not.toHaveAttribute('data-state','closing');
  });
  it('supports and cleans a legacy MediaQueryList listener',()=>{
    legacy=true;const view=show();const toggle=open();expect(legacyAdd).toHaveBeenCalled();resize(1280);expect(toggle).toHaveAttribute('aria-expanded','false');unlocked();view.unmount();
    expect(legacyRemove).toHaveBeenCalled();expect(listeners.size).toBe(0);
  });
});
