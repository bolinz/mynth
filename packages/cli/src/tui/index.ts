import type { CoreEngine } from '@mynth/core';

function ts(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export async function startTui(engine: CoreEngine): Promise<void> {
  // Dynamic import for neo-blessed (ESM compatible)
  const blessed = await import('neo-blessed');

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Mynth',
  });

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' Mynth TUI  |  Press q to quit',
    style: { fg: 'white', bg: 'blue' },
  });

  // Agent pool panel
  const agentPanel = blessed.box({
    top: 1,
    left: 0,
    width: '40%',
    height: '60%',
    label: ' Agent Pool ',
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    scrollable: true,
    alwaysScroll: true,
  });

  // Task chain panel
  const chainPanel = blessed.box({
    top: 1,
    left: '40%',
    width: '60%',
    height: '60%',
    label: ' Task Chain ',
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
    scrollable: true,
    alwaysScroll: true,
  });

  // Event log panel
  const logPanel = blessed.box({
    top: '60%',
    left: 0,
    width: '100%',
    height: '40%-1',
    label: ' Event Log ',
    border: { type: 'line' },
    style: { border: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
  });

  screen.append(header);
  screen.append(agentPanel);
  screen.append(chainPanel);
  screen.append(logPanel);

  function log(msg: string): void {
    const line = `  {white-fg}[${ts()}]{/white-fg} ${msg}`;
    logPanel.pushLine(line);
    logPanel.setScrollPerc(100);
    screen.render();
  }

  function updateAgentPanel(): void {
    const agents = engine.getAgentPool().getAllAgents();
    const lines = agents.map((a) => {
      const stateColor =
        a.state === 'working'
          ? '{green-fg}'
          : a.state === 'error'
            ? '{red-fg}'
            : a.state === 'transferring'
              ? '{yellow-fg}'
              : '{white-fg}';
      const caps = a.capabilities.map((c) => c.type).join(', ');
      return `  ${a.name.padEnd(12)} ${stateColor}${a.state.padEnd(12)}{/} [${caps}]`;
    });
    agentPanel.setContent(lines.join('\n'));
    screen.render();
  }

  function updateChainPanel(task: string, chain: string[]): void {
    if (chain.length === 0) {
      chainPanel.setContent('  Waiting for task...\n\n  Type a task below and press Enter');
    } else {
      const lines = chain.map((step, i) => {
        const arrow = i < chain.length - 1 ? ' \u2192 ' : ' \u2713';
        return `  ${i + 1}. ${step}${arrow}`;
      });
      chainPanel.setContent(`  Task: {yellow-fg}${task}{/}\n${lines.join('\n')}`);
    }
    screen.render();
  }

  // Subscribe to events
  engine.eventBus.subscribe('agent.state_changed', (_t, p) => {
    const e = p as any;
    log(`${e.fromState} \u2192 ${e.toState}  (${e.agentId})`);
    updateAgentPanel();
  });

  engine.eventBus.subscribe('hop.recorded', (_t, p) => {
    const e = p as any;
    if (e.to) {
      log(`{cyan-fg}${e.from}{/} \u2192 {green-fg}${e.to}{/}  (${e.duration}ms)`);
    }
  });

  engine.eventBus.subscribe('anomaly.detected', (_t, p) => {
    const e = p as any;
    log(`{red-fg}\u26a0 ${e.type}{/}`);
  });

  engine.eventBus.subscribe('intervention.executed', (_t, p) => {
    const e = p as any;
    log(`{yellow-fg}\u2139 ${e.type}{/}`);
  });

  // Task input
  const input = blessed.textbox({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    inputOnFocus: true,
    style: { bg: 'black', fg: 'white' },
  });

  screen.append(input);

  input.on('submit', async (value: string) => {
    const task = value.trim();
    if (!task) return;
    input.clearValue();
    input.readInput();

    log(`Running: {yellow-fg}${task}{/}`);
    updateChainPanel(task, ['initializing...']);
    input.hide();
    screen.render();

    try {
      const result = await engine.executeTask(task);
      const chain =
        result.hops > 0 ? [`completed in ${result.hops} hop${result.hops > 1 ? 's' : ''}`] : [];
      updateChainPanel(task, chain);
      log(`{green-fg}\u2713 ${result.taskId}: ${result.status}{/}`);
    } catch (err) {
      log(`{red-fg}\u2717 Error: ${String(err)}{/}`);
    }

    input.show();
    screen.render();
  });

  // Focus input and render
  input.focus();
  updateAgentPanel();
  updateChainPanel('', []);
  screen.render();

  // Quit on 'q'
  screen.key(['q', 'C-c'], () => {
    process.exit(0);
  });
}
