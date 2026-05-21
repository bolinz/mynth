import type { CoreEngine } from '@mynth/core';

function ts(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export async function startTui(engine: CoreEngine): Promise<void> {
  const blessed = await import('neo-blessed');

  const screen = blessed.screen({ smartCSR: true, title: 'Mynth', dockBorders: true });

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content:
      ' {bold}Mynth TUI{/bold}  {cyan-fg}v0.1.0{/}  |  {green-fg}q{/} quit  {green-fg}Enter{/} run',
    style: { fg: 'white', bg: 17 },
  });

  // Agent pool panel
  const agentPanel = blessed.box({
    top: 1,
    left: 0,
    width: '35%',
    height: '60%',
    label: ' {bold}Agents{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 39 }, label: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
  });

  // Stats panel (small)
  const statsPanel = blessed.box({
    top: 1,
    left: '35%',
    width: '65%',
    height: '15%',
    label: ' {bold}System{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 220 }, label: { fg: 'white' } },
    tags: true,
  });

  // Task chain panel
  const chainPanel = blessed.box({
    top: '15%+1',
    left: '35%',
    width: '65%',
    height: '45%-1',
    label: ' {bold}Chain{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 42 }, label: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
  });

  // Event log panel
  const logPanel = blessed.box({
    top: '60%',
    left: 0,
    width: '100%',
    height: '40%-2',
    label: ' {bold}Events{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 'white' }, label: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
  });

  // Status bar
  const statusBar = blessed.box({
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    style: { fg: 'black', bg: 236 },
    tags: true,
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

  screen.append(header);
  screen.append(agentPanel);
  screen.append(statsPanel);
  screen.append(chainPanel);
  screen.append(logPanel);
  screen.append(statusBar);
  screen.append(input);

  let taskCount = 0;
  let hopCount = 0;
  let currentTask: string | null = null;

  function log(prefix: string, msg: string, color: string): void {
    const line = `  {gray-fg}[${ts()}]{/} ${color}${prefix}{/} ${msg}`;
    logPanel.pushLine(line);
    logPanel.setScrollPerc(100);
    screen.render();
  }

  function updateStats(): void {
    const agents = engine.getAgentPool().getAllAgents();
    const active = agents.filter((a) => a.state !== 'idle').length;
    statsPanel.setContent(
      `  {cyan-fg}Tasks:{/}    ${taskCount}\n` +
        `  {yellow-fg}Hops:{/}     ${hopCount}\n` +
        `  {green-fg}Agents:{/}   ${agents.length}  {gray-fg}(${active} active){/}\n` +
        `  {white-fg}Current:{/}  ${currentTask ?? '{gray-fg}idle{/}'}`,
    );
    statusBar.setContent(
      ` {black-fg}{231-fg} Agents:{/} ${agents.length}  |  Tasks: ${taskCount}  |  Hops: ${hopCount}  `,
    );
    screen.render();
  }

  function updateAgentPanel(): void {
    const agents = engine.getAgentPool().getAllAgents();
    const lines = agents.map((a) => {
      const active = a.state !== 'idle';
      const dot = active
        ? a.state === 'working'
          ? '{55-fg}\u25cf{/}'
          : a.state === 'transferring'
            ? '{cyan-fg}\u25b6{/}'
            : '{red-fg}\u25cf{/}'
        : '{gray-fg}\u25cb{/}';
      const nameColor = active ? '{bold}{white-fg}' : '{gray-fg}';
      const stateColor =
        a.state === 'working'
          ? '{green-fg}'
          : a.state === 'transferring'
            ? '{cyan-fg}'
            : a.state === 'error'
              ? '{red-fg}'
              : '{gray-fg}';
      const caps = a.capabilities
        .map((c) => c.type)
        .slice(0, 2)
        .join(' ');
      return `  ${dot} ${nameColor}${a.name.padEnd(10)}{/} ${stateColor}${a.state.padEnd(12)}{/} {240-fg}${caps}{/}`;
    });
    agentPanel.setContent(lines.join('\n'));
    updateStats();
    screen.render();
  }

  function updateChainPanel(chainSteps: string[]): void {
    if (chainSteps.length === 0) {
      chainPanel.setContent('  {gray-fg}No active task.\n  Type a task below and press Enter.{/}');
    } else {
      const lines = chainSteps.map((s, i) => {
        const num = `{green-fg}${i + 1}{/}`;
        const color = i === chainSteps.length - 1 ? '{cyan-fg}' : '{green-fg}';
        return `  ${num}. ${color}${s}{/}`;
      });
      chainPanel.setContent(lines.join('\n'));
    }
    screen.render();
  }

  // Subscribe to events
  engine.eventBus.subscribe('agent.state_changed', (_t, p) => {
    const e = p as any;
    if (e.toState === 'working') {
      log('\u25b6', `${e.agentId} ${e.fromState} \u2192 {green-fg}${e.toState}{/}`, '{cyan-fg}');
    }
    updateAgentPanel();
  });

  engine.eventBus.subscribe('hop.recorded', (_t, p) => {
    const e = p as any;
    hopCount++;
    if (e.to) {
      log(
        '\u2192',
        `${e.from} \u2192 {cyan-fg}${e.to}{/}  {gray-fg}(${e.duration}ms){/}`,
        '{cyan-fg}',
      );
    }
    updateStats();
  });

  engine.eventBus.subscribe('task.completed', (_t, p) => {
    const e = p as any;
    taskCount++;
    currentTask = null;
    log(
      '\u2713',
      `{green-fg}${e.taskId}{/}: {bold}${e.status}{/bold}  ({e.hops} hops)`,
      '{green-fg}',
    );
    updateChainPanel([]);
    updateStats();
  });

  engine.eventBus.subscribe('anomaly.detected', (_t, p) => {
    const e = p as any;
    log('\u26a0', `{red-fg}${e.type}{/}${e.agentId ? ' (' + e.agentId + ')' : ''}`, '{red-fg}');
  });

  engine.eventBus.subscribe('intervention.executed', (_t, p) => {
    const e = p as any;
    log('\u2139', `{yellow-fg}${e.type}{/}`, '{yellow-fg}');
  });

  input.on('submit', async (value: string) => {
    const task = value.trim();
    if (!task) return;
    input.clearValue();
    input.readInput();

    currentTask = task;
    taskCount++;
    log('\u25b6', `Running: {yellow-fg}${task}{/}`, '{cyan-fg}');
    updateChainPanel([`Analyzing: ${task}`]);
    updateStats();
    input.hide();
    screen.render();

    try {
      const result = await engine.executeTask(task);
      updateChainPanel(
        result.hops > 0
          ? [
              task,
              ...Array.from({ length: result.hops }, (_, i) => `Hop ${i + 1}`),
              `\u2713 ${result.status}`,
            ]
          : [task, `\u2713 ${result.status}`],
      );
    } catch (err) {
      log('\u2717', `{red-fg}Error: ${String(err)}{/}`, '{red-fg}');
    }

    currentTask = null;
    input.show();
    screen.render();
  });

  input.focus();
  updateAgentPanel();
  updateChainPanel([]);
  updateStats();
  screen.render();

  screen.key(['q', 'C-c'], () => process.exit(0));
}
