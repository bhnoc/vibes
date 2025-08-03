import React, { useState, useEffect, useRef } from 'react';
import { usePinStore } from '../stores/pinStore';

export const CommandBar = () => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const { addPinnedIP, removePinnedIP, pinnedIPs } = usePinStore();
  const consoleRef = useRef<HTMLDivElement>(null);

  const handleCommandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCommand(e.target.value);
  };

  const handleCommandSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const [action, ...args] = command.trim().split(' ');
    let output = '';

    if (action === '/pin') {
      const ip = args[0];
      if (ip) {
        addPinnedIP(ip);
        output = `Pinned IP: ${ip}`;
      }
    } else if (action === '/unpin') {
      const ip = args[0];
      if (ip) {
        removePinnedIP(ip);
        output = `Unpinned IP: ${ip}`;
      }
    } else if (action === '/pinned') {
      output = `Pinned IPs: ${Array.from(pinnedIPs).join(', ')}`;
    } else if (action === '/help') {
      output = `Available commands: /pin [ip], /unpin [ip], /pinned, /help, /whoami`;
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
    const handleClickOutside = (event: MouseEvent) => {
      if (consoleRef.current && !consoleRef.current.contains(event.target as Node)) {
        setShowConsole(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [consoleRef]);

  return (
    <div className="command-bar-container" ref={consoleRef}>
      {showConsole && (
        <div className="console-output">
          {history.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
      <form onSubmit={handleCommandSubmit}>
        <input
          type="text"
          value={command}
          onChange={handleCommandChange}
          placeholder="Enter command... (e.g. /pin 192.168.1.1)"
          className="command-input"
        />
      </form>
    </div>
  );
};

