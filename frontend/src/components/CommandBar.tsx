import React, { useState, useEffect, useRef } from 'react';
import { usePinStore } from '../stores/pinStore';
import { useNetworkStore } from '../stores/networkStore';

export const CommandBar = () => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const { addPinnedIP, removePinnedIP, pinnedIPs } = usePinStore();
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
      const target = args[0];
      if (target) {
        if (target.startsWith('port:')) {
          const port = parseInt(target.split(':')[1]);
          if (!isNaN(port)) {
            const nodesToPin = nodes.filter(node => node.ports.has(port));
            nodesToPin.forEach(node => addPinnedIP(node.id));
            output = `Pinned ${nodesToPin.length} nodes with port ${port}`;
          }
        } else {
          addPinnedIP(target);
          output = `Pinned IP: ${target}`;
        }
      }
    } else if (action === '/unpin') {
        const target = args[0];
        if (target) {
            if (target.startsWith('port:')) {
            const port = parseInt(target.split(':')[1]);
            if (!isNaN(port)) {
                const nodesToUnpin = nodes.filter(node => node.ports.has(port));
                nodesToUnpin.forEach(node => removePinnedIP(node.id));
                output = `Unpinned ${nodesToUnpin.length} nodes with port ${port}`;
            }
            } else {
            removePinnedIP(target);
            output = `Unpinned IP: ${target}`;
            }
        }
    } else if (action === '/pinned') {
      output = `Pinned IPs: ${Array.from(pinnedIPs).join(', ')}`;
    } else if (action === '/list' && args[0] === 'pinned') {
        output = `Pinned IPs: ${Array.from(pinnedIPs).join(', ')}`;
    } else if (action === '/help') {
      output = `Available commands: /pin [ip|port:number], /unpin [ip|port:number], /pinned, /list pinned, /help, /whoami`;
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
          placeholder="Press '`' to focus. Eg: /pin 1.1.1.1, /unpin port:443"
          className="command-input"
        />
      </form>
    </div>
  );
};

