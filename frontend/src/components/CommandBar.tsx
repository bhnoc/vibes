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


export const CommandBar = () => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const { addPinningRule, removePinningRule, pinningRules, clearAllPins } = usePinStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const consoleOutputRef = useRef<HTMLDivElement>(null);

  const PROMPT = 'u@vibes$#';

  const executeCommand = () => {
    if (command.trim() === '') return;
    const [action, ...args] = command.trim().split(' ');
    let output = '';

    if (action === '/pin') {
      const rule = args[0];
      if (rule) {
        addPinningRule(rule);
        output = `Added pinning rule: ${rule}`;
      }
    } else if (action === '/unpin') {
        const rule = args[0];
        if (rule === 'clear') {
            clearAllPins();
            output = 'All pinning rules have been cleared.';
        } else if (rule) {
            removePinningRule(rule);
            output = `Removed pinning rule: ${rule}`;
        }
    } else if (action === '/pinned' || (action === '/list' && args[0] === 'pinned')) {
      output = `Active pinning rules: ${Array.from(pinningRules).join(', ')}`;
    } else if (action === '/help') {
      output = `Available commands: /pin, /unpin, /pinned, /list pinned, /help, /whoami`;
    } else if (action === '/whoami') {
      output = 'd4rkm4tter was here';
    } else {
      output = `Unknown command: ${action}`;
    }
    
    const commandWithPrompt = `${PROMPT} ${command}`;
    setHistory((prevHistory) => [...prevHistory, commandWithPrompt, output].slice(-20));
    setCommand('');
  };

  const toggleConsole = useCallback(() => {
    setShowConsole(prev => {
      const newShowState = !prev;
      if (newShowState) {
        // Use a timeout to ensure the DOM is updated before we try to focus
        setTimeout(() => {
          // Directly find and focus the textarea within our component
          const textarea = containerRef.current?.querySelector('textarea');
          textarea?.focus();
        }, 0);
      }
      return newShowState;
    });
  }, []);

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
    }
  };

  useEffect(() => {
    if (showConsole && consoleOutputRef.current) {
      consoleOutputRef.current.scrollTop = consoleOutputRef.current.scrollHeight;
    }
  }, [history, showConsole]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showConsole && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowConsole(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showConsole, containerRef]);

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
    <div className="command-bar-container" ref={containerRef}>
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
        onClick={() => !showConsole && toggleConsole()}
      >
        <Editor
          value={command}
          onValueChange={code => setCommand(code)}
          highlight={code => Prism.highlight(code, Prism.languages.vibes, 'vibes')}
          padding={{ top: 10, right: 10, bottom: 10, left: showConsole ? 100 : 10 }}
          className="command-input-editor"
          placeholder={showConsole ? '' : "Press '`' to open console"}
        />
      </div>
    </div>
  );
};
