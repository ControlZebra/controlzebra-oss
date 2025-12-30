import { memo, useState, useCallback, useRef, useEffect } from 'react';

function TerminalPanel() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([
    { type: 'output', text: 'Welcome to Rewind Logic Terminal' },
    { type: 'output', text: 'Type "help" for available commands' },
  ]);
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const command = input.trim();
    setHistory(prev => [...prev, { type: 'input', text: `$ ${command}` }]);

    // Mock command handling
    if (command === 'help') {
      setHistory(prev => [...prev, { 
        type: 'output', 
        text: 'Available: git status, git log, git branch, clear' 
      }]);
    } else if (command === 'clear') {
      setHistory([]);
    } else if (command.startsWith('git ')) {
      setHistory(prev => [...prev, { 
        type: 'output', 
        text: `Executing: ${command}...` 
      }]);
    } else {
      setHistory(prev => [...prev, { 
        type: 'error', 
        text: `Unknown command: ${command}` 
      }]);
    }

    setInput('');
  }, [input]);

  return (
    <div className="h-full flex flex-col">
      <div 
        ref={outputRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5"
      >
        {history.map((line, i) => (
          <p 
            key={i} 
            className={
              line.type === 'error' ? 'text-red-400' :
              line.type === 'input' ? 'text-blue-400' : 
              'text-gray-400'
            }
          >
            {line.text}
          </p>
        ))}
      </div>
      
      <form onSubmit={handleSubmit} className="shrink-0 px-3 pb-2">
        <div className="flex items-center gap-2 bg-gray-800 rounded px-2">
          <span className="text-green-400 text-xs font-mono">$</span>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Enter command..."
            className="flex-1 py-1.5 bg-transparent text-gray-200 text-xs font-mono placeholder-gray-600 focus:outline-none"
          />
        </div>
      </form>
    </div>
  );
}

export default memo(TerminalPanel);
