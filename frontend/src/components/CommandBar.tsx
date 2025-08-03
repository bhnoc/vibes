import React, { useState, useEffect, useRef } from 'react';
import { usePinStore } from '../stores/pinStore';
import { useNetworkStore } from '../stores/networkStore';

export const CommandBar = () => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const { addPinningRule, removePinningRule, pinningRules, clearAllPins } = usePinStore();
  const { nodes } = useNetworkStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consoleOutputRef = useRef<HTMLDivElement>(null);

  const handleCommandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCommand(e.target.value);
  };

  const handleCommandSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      output = `Available commands: /pin [ip|cidr|range], /unpin [ip|cidr|range|clear], /pinned, /list pinned, /help, /whoami`;
    } else if (action === '/whoami') {
      output = 'd4rkm4tter was here';
    } else {
      output = `Unknown command: ${action}`;
    }
    
    setHistory((prevHistory) => [...prevHistory, `> ${command}`, output].slice(-20)); // Keep last 10 commands + outputs
    setShowConsole(true);
    setCommand('');
  };

  useEffect(() => {
    if (consoleOutputRef.current) {
      consoleOutputRef.current.scrollTop = consoleOutputRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowConsole(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [containerRef]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === '`' || event.key === '~') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  return (
    <div className="command-bar-container" ref={containerRef}>
      {showConsole && (
        <div className="console-output" ref={consoleOutputRef}>
          {history.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
      <form onSubmit={handleCommandSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={handleCommandChange}
          placeholder="Press '`' to focus. Eg: /pin 1.1.1.1, /unpin 10.0.0.0/24"
          className="command-input"
        />
      </form>
    </div>
  );
};
