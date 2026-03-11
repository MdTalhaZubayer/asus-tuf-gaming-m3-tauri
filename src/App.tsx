import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  RotateCcw, Activity, Zap,
  Lightbulb, MousePointer2, ChevronDown, RefreshCw, Save
} from 'lucide-react';
import logo from './assets/logo.svg';
import './App.css';

// ── Types ──────────────────────────────────────────
type MouseSettings = {
  activeProfile: number;
  dpis: number[];
  pollingRate: number;
  debounce: number;
  angleSnapping: boolean;
  led: {
    mode: 'static' | 'breathing' | 'cycle' | 'off' | 'unknown';
    brightness: number;
    r: number;
    g: number;
    b: number;
  };
  buttons: Array<{ physical: string; action: string }>;
};

// ── Constants ───────────────────────────────────────────────────────────────
const DEFAULTS = [400, 800, 1600, 3200];
const MIN_DPI = 100;
const MAX_DPI = 5100;
const STAGE_LABELS = ['Low', 'Medium', 'High', 'Precise'];
const POLLING_RATES = [125, 250, 500, 1000] as const;
const LED_MODES = ['static', 'breathing', 'cycle', 'off'] as const;
const AVAILABLE_ACTIONS = ['left', 'right', 'middle', 'back', 'forward', 'dpi-up', 'dpi-down', 'scroll-up', 'scroll-down', 'disabled'];

// ── Pretty Dropdown ────────────────────────────────────────────────────────
function PrettyDropdown({ value, options, onChange, disabled }: {
  value: string,
  options: string[],
  onChange: (v: string) => void,
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false);
  const [upwards, setUpwards] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleDropdown = () => {
    if (disabled) return;
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mainEl = containerRef.current.closest('.main');
      const bottomLimit = mainEl ? mainEl.getBoundingClientRect().bottom : window.innerHeight;
      const spaceBelow = bottomLimit - rect.bottom;
      // Flip upwards if less than 220px below
      setUpwards(spaceBelow < 220);
    }
    setOpen(!open);
  };

  return (
    <div className="dropdown" ref={containerRef}>
      <button className="dropdown__toggle" onClick={toggleDropdown} disabled={disabled}>
        <span>{value}</span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
      </button>
      {open && (
        <div className={`dropdown__menu ${upwards ? 'dropdown__menu--up' : ''}`}>
          {options.map(opt => (
            <div key={opt}
              className={`dropdown__item ${value === opt ? 'dropdown__item--active' : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState<MouseSettings>({
    activeProfile: 0, dpis: DEFAULTS, pollingRate: 1000, debounce: 12, angleSnapping: false,
    led: { mode: 'static', brightness: 4, r: 255, g: 176, b: 0 },
    buttons: []
  });
  const [editStage, setEditStage] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pendingDpi, setPendingDpi] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ msg: string; type: 'ok' | 'err' | 'info' }>({ msg: 'Ready', type: 'info' });
  const [activeTab, setActiveTab] = useState<'perf' | 'light' | 'btns'>('perf');

  const updateStatus = useCallback((msg: string, type: typeof status.type = 'info') => {
    setStatus({ msg, type });
  }, []);

  const handleRefresh = async () => {
    setBusy('refresh');
    updateStatus('Syncing from hardware...', 'info');
    try {
      const s = await invoke<MouseSettings>("get_settings");
      if (s) {
        // If LED reports no color (off state), preserve TUF orange as UI default
        if (s.led.r === 0 && s.led.g === 0 && s.led.b === 0) {
          s.led.r = 255; s.led.g = 176; s.led.b = 0;
        }
        // If brightness is 0, default to max for editing
        if (s.led.brightness === 0) s.led.brightness = 4;
        setSettings(s);
        setEditStage(s.activeProfile);
        setConnected(true);
        updateStatus('Hardware Synced Successfully.', 'ok');
      } else {
        setConnected(false);
        updateStatus('Mouse Disconnected.', 'err');
      }
    } catch (e) {
      setConnected(false);
      updateStatus('HID Comm Error: ' + e, 'err');
    } finally { setBusy(null); }
  };

  useEffect(() => { handleRefresh(); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const win = getCurrentWindow();
        win.hide()
          .catch(() => invoke("hide_window"))
          .catch(console.error);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSave = async () => {
    setBusy('save');
    updateStatus('Writing to EEPROM...', 'info');
    try {
      const ok = await invoke<boolean>("save_to_mouse", { settings });
      if (ok) {
        updateStatus('Settings stored successfully.', 'ok');
        handleRefresh();
      } else {
        updateStatus('Hardware write failed.', 'err');
      }
    } catch (e) {
      updateStatus('Write error: ' + e, 'err');
    } finally {
      setBusy(null);
    }
  };

  const handleReset = () => {
    if (activeTab === 'perf') {
      setSettings(p => ({ ...p, dpis: DEFAULTS, pollingRate: 1000, debounce: 12, angleSnapping: false }));
      updateStatus('Performance stages reset locally.', 'info');
    } else if (activeTab === 'light') {
      setSettings(p => ({ ...p, led: { mode: 'off', brightness: 4, r: 255, g: 176, b: 0 } }));
      updateStatus('Lighting defaults reset locally.', 'info');
    } else if (activeTab === 'btns') {
      const defaultBtns = [
        { physical: "left", action: "left" }, { physical: "right", action: "right" },
        { physical: "middle", action: "middle" }, { physical: "back", action: "back" },
        { physical: "forward", action: "forward" }, { physical: "dpi-up", action: "dpi-up" },
        { physical: "dpi-down", action: "dpi-down" }, { physical: "scroll-up", action: "scroll-up" },
        { physical: "scroll-down", action: "scroll-down" }
      ];
      setSettings(p => ({ ...p, buttons: defaultBtns }));
      updateStatus('Bindings reset locally.', 'info');
    }
  };

  const currentDpi = pendingDpi ?? settings.dpis[editStage] ?? 400;

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <img src={logo} className="header__logo" alt="TUF" />
          <h1 className="header__title">TUF GAMING M3</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="header__btn header__btn--sync" onClick={handleRefresh} disabled={!connected || !!busy} title="Sync from Mouse">
            <RefreshCw size={12} className={busy === 'refresh' ? 'spin' : ''} />
            <span style={{ marginLeft: '6px', fontFamily: 'var(--f-mono)', fontSize: 'var(--fs-secondary)', fontWeight: 600 }}>SYNC</span>
          </button>
          <div className={`pill ${connected === null ? 'pill--wait' : connected ? 'pill--ok' : 'pill--err'}`} style={{ marginLeft: '4px' }} />
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'perf' ? 'tab--active' : ''}`} onClick={() => setActiveTab('perf')}>Perf</button>
        <button className={`tab ${activeTab === 'light' ? 'tab--active' : ''}`} onClick={() => setActiveTab('light')}>Light</button>
        <button className={`tab ${activeTab === 'btns' ? 'tab--active' : ''}`} onClick={() => setActiveTab('btns')}>Btns</button>
      </div>

      <main className="main">
        {activeTab === 'perf' && (
          <div className="tab-content">
            <section className="card card--accent">
              <div className="card__label"><Zap size={10} /> Precision Engine</div>
              <div className="dpi-row">
                <div className="dpi-num">{currentDpi.toLocaleString()}</div>
                <div className="dpi-unit">DPI</div>
              </div>
              <input type="range" className="slider" min={MIN_DPI} max={MAX_DPI} step={100} value={currentDpi} disabled={!connected}
                onChange={e => {
                  const v = Number(e.target.value);
                  setPendingDpi(v);
                  setSettings(p => { const d = [...p.dpis]; d[editStage] = v; return { ...p, dpis: d }; });
                }}
                onPointerUp={() => setPendingDpi(null)}
                style={{ '--pct': `${((currentDpi - MIN_DPI) / (MAX_DPI - MIN_DPI)) * 100}%` } as CSSProperties}
              />
              <div style={{ marginTop: '14px' }} className="stage-tabs">
                {STAGE_LABELS.map((_, i) => (
                  <button
                    key={i}
                    className={`stage-tab ${editStage === i ? 'stage-tab--edit' : ''}`}
                    onClick={() => { setEditStage(i); setPendingDpi(null); }}
                  >
                    <span className="stage-tab__id">STAGE {i + 1}</span>
                    <span className="stage-tab__dpi">{settings.dpis[i]}</span>
                    {settings.activeProfile === i && <div className="active-badge" />}
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card__label"><Activity size={10} /> Performance</div>
              <div className="perf-group">
                <div className="perf-group__title">Polling Rate</div>
                <div className="chip-row">
                  {POLLING_RATES.map(hz => (
                    <button key={hz} className={`chip ${settings.pollingRate === hz ? 'chip--on' : ''}`} disabled={!connected}
                      onClick={() => setSettings(p => ({ ...p, pollingRate: hz }))}>{hz}Hz</button>
                  ))}
                </div>
              </div>
              <div className="perf-group" style={{ marginTop: '10px' }}>
                <div className="perf-group__title">Debounce</div>
                <div className="chip-row">
                  {[4, 12, 20, 32].map(ms => (
                    <button key={ms} className={`chip ${settings.debounce === ms ? 'chip--on' : ''}`} disabled={!connected}
                      onClick={() => setSettings(p => ({ ...p, debounce: ms }))}>{ms}ms</button>
                  ))}
                </div>
              </div>
              <div className="perf-group" style={{ marginTop: '10px' }}>
                <div className="button-row" style={{ border: 'none', padding: '4px 0' }}>
                  <div className="perf-group__title" style={{ marginBottom: 0 }}>Angle Snapping</div>
                  <button
                    className={`toggle ${settings.angleSnapping ? 'toggle--on' : ''}`}
                    disabled={!connected}
                    onClick={() => setSettings(p => ({ ...p, angleSnapping: !p.angleSnapping }))}
                  >
                    <div className="toggle__knob" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'light' && (
          <div className="tab-content">
            <section className="card light-visualizer" style={{
              '--led-color': `rgb(${settings.led.r}, ${settings.led.g}, ${settings.led.b})`,
              '--logo-url': `url(${logo})`
            } as CSSProperties}>
              <div className={`light-preview light-preview--${settings.led.mode}`}>
                <div className="light-preview__mask" />
              </div>
            </section>

            <section className="card">
              <div className="card__label"><Lightbulb size={10} /> Aura RGB</div>
              <div className="chip-row" style={{ marginBottom: '10px' }}>
                {LED_MODES.map((mode) => (
                  <button key={mode} className={`chip ${settings.led.mode === mode ? 'chip--on' : ''}`} disabled={!connected}
                    onClick={() => setSettings(p => ({ ...p, led: { ...p.led, mode: mode as any } }))} style={{ textTransform: 'capitalize' }}>{mode}</button>
                ))}
              </div>

              {(settings.led.mode === 'static' || settings.led.mode === 'breathing') && (
                <div className="perf-group">
                  <div className="perf-group__title">{settings.led.mode === 'static' ? 'Solid Color' : 'Breathing Color'}</div>
                  <input type="color" className="color-picker"
                    value={'#' + [settings.led.r, settings.led.g, settings.led.b].map(x => x.toString(16).padStart(2, '0')).join('')}
                    onChange={(e) => {
                      const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(e.target.value);
                      if (res) setSettings(p => ({ ...p, led: { ...p.led, r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) } }));
                    }} disabled={!connected} />
                </div>
              )}

              {settings.led.mode !== 'off' && (
                <div className="perf-group" style={{ marginTop: '10px' }}>
                  <div className="perf-group__title">Intensity</div>
                  <input type="range" className="slider" min={1} max={4} step={1} value={Math.max(1, settings.led.brightness)} disabled={!connected}
                    onChange={e => setSettings(p => ({ ...p, led: { ...p.led, brightness: Number(e.target.value) } }))}
                    style={{ '--pct': `${((Math.max(1, settings.led.brightness) - 1) / 3) * 100}%` } as CSSProperties}
                  />
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'btns' && (
          <div className="tab-content">
            <section className="card">
              <div className="card__label"><MousePointer2 size={10} /> Mapping</div>
              <div className="button-list">
                {settings.buttons.slice(0, 7).map((b, i) => (
                  <div key={i} className="button-row">
                    <span className="button-label">{b.physical}</span>
                    <PrettyDropdown
                      value={b.action}
                      options={AVAILABLE_ACTIONS}
                      disabled={!connected}
                      onChange={act => setSettings(p => ({
                        ...p, buttons: p.buttons.map(btn => btn.physical === b.physical ? { ...btn, action: act } : btn)
                      }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <div className="action-bar">
        <button className="btn btn--ghost" onClick={handleReset} disabled={!connected || !!busy}>
          <RotateCcw size={14} /> <span>RESET</span>
        </button>
        <button className="btn btn--primary" onClick={handleSave} disabled={!connected || !!busy}>
          <Save size={14} /> <span>{busy === 'save' ? 'SYNCING...' : 'APPLY CONFIG'}</span>
        </button>
      </div>

      <div className={`status-bar status-bar--${status.type}`}>
        {status.msg}
      </div>
    </div>
  );
}
