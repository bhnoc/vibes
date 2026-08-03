import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import { usePinStore } from '../stores/pinStore';
import { useWindowStore } from '../stores/windowStore';

// --- Custom PrismJS Grammar for our commands ---
Prism.languages.vibes = {
  'command': {
    pattern: /^\/(pin|unpin|pinned|list|debug|legend|settings|physics|perf|load|tools|help|whoami)\b/,
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


/**
 * Slash commands that open a floating tool.
 *
 * Kept as a table so the console, the icon rail and the command palette cannot
 * drift apart: adding a tool here is what makes it typeable, and /tools prints
 * this same list so nothing is discoverable only by having read the source.
 */
const TOOL_COMMANDS: Record<string, { target: 'debug' | 'legend' | 'settings' | 'perf'; label: string; note?: string }> = {
  '/debug': { target: 'debug', label: 'Diagnostics' },
  '/legend': { target: 'legend', label: 'Theme legend' },
  '/settings': { target: 'settings', label: 'Capture settings' },
  '/physics': { target: 'settings', label: 'Capture settings', note: ' Physics lives on its Physics tab.' },
  '/perf': { target: 'perf', label: 'Load generator' },
  '/load': { target: 'perf', label: 'Load generator' },
};

const TOOL_LIST = Object.keys(TOOL_COMMANDS).join(', ');

export interface CommandBarProps {
  onConsoleToggle?: (isOpen: boolean) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onConsoleToggle }) => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const { addPinningRule, removePinningRule, pinningRules, clearAllPins } = usePinStore();
  const { toggleSettings, toggleDebug, toggleLegend, togglePerfTest, closeAll } = useWindowStore();
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
    } else if (TOOL_COMMANDS[action]) {
      const tool = TOOL_COMMANDS[action];
      const toggle = {
        debug: toggleDebug,
        legend: toggleLegend,
        settings: toggleSettings,
        perf: togglePerfTest,
      }[tool.target];

      if (arg0 === 'open' || arg0 === 'on' || arg0 === '1') {
        toggle(true);
        output = `${tool.label} opened.${tool.note ?? ''}`;
      } else if (arg0 === 'close' || arg0 === 'off' || arg0 === '0') {
        toggle(false);
        output = `${tool.label} closed.`;
      } else {
        toggle();
        output = `Toggled ${tool.label.toLowerCase()}.${tool.note ?? ''}`;
      }
    } else if (action === '/tools') {
      if (arg0 === 'close') {
        closeAll();
        output = 'Closed every floating tool.';
      } else {
        output = `Tools: ${TOOL_LIST}. Each takes open/close, or toggles with no argument. /tools close hides them all.`;
      }
    } else if (action === '/help') {
      output = `Available commands: /pin, /unpin, /pinned, /list pinned, /tools, ${TOOL_LIST}, /help, /whoami`;
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
        aria-pressed={showConsole}
        style={{
          height: 20,
          flexShrink: 0,
          padding: '0 var(--spacing-2)',
          background: showConsole ? 'var(--wash-ok)' : 'transparent',
          border: `1px solid ${showConsole ? 'color-mix(in oklab,var(--signal-teal) 35%,transparent)' : 'var(--input)'}`,
          borderRadius: 'var(--radius-sm)',
          color: showConsole ? 'var(--signal-teal)' : 'var(--muted-foreground)',
          font: 'var(--type-data-sm)',
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'var(--transition-control)',
        }}
        title="Toggle the pin console (~)"
      >
        Console
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
          <span style={{ color: 'var(--signal-teal)', font: 'var(--type-data-sm)', marginRight: 'var(--spacing-1-5)', userSelect: 'none', flexShrink: 0 }}>
            {PROMPT}
          </span>
        )}
        {/* Padding is kept tight because this editor lives inside the 28px
            status bar, where the shadcn control ladder has no rung. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editor
            value={command}
            onValueChange={code => setCommand(code)}
            highlight={code => Prism.highlight(code, Prism.languages.vibes, 'vibes')}
            padding={{ top: 3, right: 6, bottom: 3, left: 2 }}
            className="command-input-editor"
            placeholder="/help for commands"
          />
        </div>
      </div>
    </div>
  );
};
