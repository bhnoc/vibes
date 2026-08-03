import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import { usePinStore } from '../stores/pinStore';

// --- Custom PrismJS Grammar for our commands ---
Prism.languages.vibes = {
  'command': {
    pattern: /^\/(pin|unpin|pinned|list|help|whoami)\b/,
    alias: 'keyword',
  },
  'subcommand': {
    pattern: /(?<=\/list\s)pinned/,
    alias: 'function',
  },
  'argument-keyword': {
    pattern: /(?<=\s)(port|clear)\b/g,
    alias: 'builtin',
  },
  'ip-address': {
    pattern: /\b\d{1,3}(\.\d{1,3}){3}\b/g,
    alias: 'number',
  },
  'cidr': {
    pattern: /\/\d{1,2}\b/,
    alias: 'operator',
  },
  'ip-range': {
    pattern: /-\d{1,3}\b/,
    alias: 'operator',
  },
  'port-number': {
    pattern: /:\d+/,
    alias: 'number'
  }
};


export interface CommandBarProps {
  onConsoleToggle?: (isOpen: boolean) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onConsoleToggle }) => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const { addPinningRule, removePinningRule, pinningRules, clearAllPins } = usePinStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const consoleOutputRef = useRef<HTMLDivElement>(null);

  const PROMPT = 'u@vibes$#';

  const executeCommand = () => {
    if (command.trim() === '') return;
    const [rawAction, ...args] = command.trim().split(' ');
    const action = rawAction.toLowerCase();
    const arg0 = args[0]?.toLowerCase();
    let output = '';

    if (action === '/pin') {
      const rule = args[0];
      if (rule) {
        addPinningRule(rule);
        output = `Added pinning rule: ${rule}`;
      }
    } else if (action === '/unpin') {
      const rule = args[0];
      if (arg0 === 'clear') {
        clearAllPins();
        output = 'All pinning rules have been cleared.';
      } else if (rule) {
        removePinningRule(rule);
        output = `Removed pinning rule: ${rule}`;
      }
    } else if (action === '/pinned' || (action === '/list' && arg0 === 'pinned')) {
      output = `Active pinning rules: ${Array.from(pinningRules).join(', ')}`;
    } else if (action === '/help') {
      output = `Available commands: /pin, /unpin, /pinned, /list pinned, /help, /whoami`;
    } else if (action === '/whoami') {
      output = 'd4rkm4tter was here';
    } else {
      output = `Unknown command: ${rawAction}`;
    }
    
    const commandWithPrompt = `${PROMPT} ${command}`;
    setHistory((prevHistory) => [...prevHistory, commandWithPrompt, output].slice(-20));
    setCommand('');
    if (!showConsole) {
      setShowConsole(true);
      onConsoleToggle?.(true);
    }
  };

  const toggleConsole = useCallback(() => {
    setShowConsole(prev => {
      const newShowState = !prev;
      onConsoleToggle?.(newShowState);
      if (newShowState) {
        setTimeout(() => {
          const textarea = containerRef.current?.querySelector('textarea');
          textarea?.focus();
        }, 50);
      }
      return newShowState;
    });
  }, [onConsoleToggle]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const lastCommand = [...history].reverse().find(h => h.startsWith(PROMPT));
      if (lastCommand) {
        setCommand(lastCommand.replace(`${PROMPT} `, ''));
      }
    } else if (e.key === 'Escape' && showConsole) {
      e.preventDefault();
      setShowConsole(false);
      onConsoleToggle?.(false);
    }
  };

  useEffect(() => {
    if (showConsole && consoleOutputRef.current) {
      consoleOutputRef.current.scrollTop = consoleOutputRef.current.scrollHeight;
    }
  }, [history, showConsole]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === '`' || event.key === '~') {
        event.preventDefault();
        toggleConsole();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [toggleConsole]);

  return (
    <div className="command-bar-container" ref={containerRef} style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
      <button
        onClick={toggleConsole}
        style={{
          background: showConsole ? 'var(--wash-ok, rgba(0, 210, 170, 0.14))' : 'transparent',
          border: 'var(--border-control, 1px solid rgba(255,255,255,0.15))',
          color: showConsole ? 'var(--signal-teal, #00d2aa)' : 'var(--text-muted)',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '2px 8px',
          font: 'var(--type-mono)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        title="Toggle Command Console (~)"
      >
        {showConsole ? '[-] CONSOLE' : '[~] CONSOLE'}
      </button>

      {showConsole && (
        <div className="console-output" ref={consoleOutputRef}>
          {history.map((line, index) => {
            if (line.startsWith(PROMPT)) {
              const cmd = line.replace(`${PROMPT} `, '');
              const highlighted = Prism.highlight(cmd, Prism.languages.vibes, 'vibes');
              return (
                <div key={index}>
                  <span className="prompt">{PROMPT}</span>
                  <span dangerouslySetInnerHTML={{ __html: highlighted }} />
                </div>
              );
            }
            return <div key={index}>{line}</div>;
          })}
        </div>
      )}
      <div 
        className={`editor-container ${showConsole ? 'console-active' : ''}`}
        onKeyDown={handleKeyDown} 
        style={{ flex: 1, display: 'flex', alignItems: 'center' }}
      >
        {showConsole && (
          <span style={{ color: 'var(--signal-teal, #00d2aa)', font: 'var(--type-mono)', marginRight: '6px', userSelect: 'none', flexShrink: 0 }}>
            {PROMPT}
          </span>
        )}
        <div style={{ flex: 1 }}>
          <Editor
            value={command}
            onValueChange={code => setCommand(code)}
            highlight={code => Prism.highlight(code, Prism.languages.vibes, 'vibes')}
            padding={{ top: 8, right: 10, bottom: 8, left: 2 }}
            className="command-input-editor"
            placeholder="CONSOLE ['~' to toggle] | /help"
          />
        </div>
      </div>
    </div>
  );
};
