import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/trayMenu.css';

type TrayMenuState = { alwaysOnTop: boolean; visible: boolean };

function TrayMenu(): JSX.Element {
  const [state, setState] = useState<TrayMenuState>({ alwaysOnTop: false, visible: true });

  useEffect(() => {
    void window.workFocus.getTrayMenuState().then(setState);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') void window.workFocus.closeTrayMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = (action: 'toggle-window' | 'toggle-always-on-top' | 'quit'): void => {
    void window.workFocus.trayMenuAction(action);
  };

  return (
    <div className="tray-menu">
      <button type="button" className="tray-menu-item" onClick={() => run('toggle-window')}>
        <span>{state.visible ? '隐藏组件' : '显示组件'}</span>
      </button>
      <button type="button" className="tray-menu-item" onClick={() => run('toggle-always-on-top')}>
        <span>始终置顶</span>
        {state.alwaysOnTop ? <span className="tray-menu-check">✓</span> : null}
      </button>
      <div className="tray-menu-sep" />
      <button type="button" className="tray-menu-item is-danger" onClick={() => run('quit')}>
        <span>退出应用</span>
      </button>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<TrayMenu />);
