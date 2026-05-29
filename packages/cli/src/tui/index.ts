import type { CoreEngine } from '@mynth/core';

function ts(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export async function startTui(engine: CoreEngine): Promise<void> {
  const blessed = await import('neo-blessed');

  const screen = blessed.screen({ smartCSR: true, title: 'Mynth', dockBorders: true });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content:
      ' {bold}Mynth TUI{/bold}  {cyan-fg}v0.1.0{/}  |  {green-fg}q{/} quit  {green-fg}t{/} tree  {green-fg}Enter{/} run  {green-fg}Esc{/} cancel  {green-fg}↑↓{/} history  {green-fg}Ctrl+L{/} clear  {green-fg}//help{/} commands',
    style: { fg: 'white', bg: 17 },
  });

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

  const treePanel = blessed.box({
    top: 1,
    left: 0,
    width: '100%',
    height: '83%',
    label: ' {bold}Task Tree{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 129 }, label: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    hidden: true,
  });

  const logPanel = blessed.box({
    top: '60%',
    left: 0,
    width: '50%',
    height: '40%-2',
    label: ' {bold}Events{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 'white' }, label: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
  });

  const approvalPanel = blessed.box({
    top: '60%',
    left: '50%',
    width: '50%',
    height: '40%-2',
    label: ' {bold}Approvals{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 220 }, label: { fg: 'yellow' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    hidden: true,
  });

  const statusBar = blessed.box({
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    style: { fg: 'black', bg: 236 },
    tags: true,
  });

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
  screen.append(treePanel);
  screen.append(logPanel);
  screen.append(approvalPanel);
  screen.append(statusBar);
  screen.append(input);

  let showTreePanel = false;
  let taskCount = 0;
  let hopCount = 0;
  let pendingApprovals = 0;
  let degradationLevel = 0;
  let currentTask: string | null = null;
  let cancelled = false;
  let currentHops: string[] = [];
  let currentHopDetails: Array<{ from: string; to: string; duration: number }> = [];
  const commandHistory: string[] = [];
  let historyIdx = -1;

  const unsubs: Array<() => void> = [];

  function log(prefix: string, msg: string, color: string): void {
    const line = `  {gray-fg}[${ts()}]{/} ${color}${prefix}{/} ${msg}`;
    logPanel.pushLine(line);
    logPanel.setScrollPerc(100);
    screen.render();
  }

  function updateStats(): void {
    const agents = engine.getAgentPool().getAllAgents();
    const active = agents.filter((a) => a.state !== 'idle').length;
    const degColor =
      degradationLevel === 0 ? '{green-fg}' : degradationLevel >= 3 ? '{red-fg}' : '{yellow-fg}';
    statsPanel.setContent(
      `  {cyan-fg}Tasks:{/}    ${taskCount}\n` +
        `  {yellow-fg}Hops:{/}     ${hopCount}\n` +
        `  {green-fg}Agents:{/}   ${agents.length}  {gray-fg}(${active} active){/}\n` +
        `  ${degColor}Degrad:{/}   L${degradationLevel}\n` +
        `  {white-fg}Current:{/}  ${currentTask ?? '{gray-fg}idle{/}'}`,
    );
    pendingApprovals = engine.hitlManager.getPendingCount();
    statusBar.setContent(
      ` {black-fg}{231-fg} Agents:{/} ${agents.length}  |  Tasks: ${taskCount}  |  Hops: ${hopCount}  ${pendingApprovals > 0 ? ` | {yellow-fg}Pending: ${pendingApprovals}{/}` : ''}`,
    );
    screen.render();
  }

  function updateApprovalPanel(): void {
    const pending = engine.hitlManager.getPending();
    if (pending.length === 0) {
      approvalPanel.hide();
      screen.render();
      return;
    }
    approvalPanel.show();
    const lines = pending.map((req) => {
      return (
        `  {bold}${req.id}{/}\n` +
        `    Agent: ${req.agentId}  |  Type: {yellow-fg}${req.operation.type}{/}\n` +
        `    {white-fg}${req.operation.summary}{/}\n`
      );
    });
    approvalPanel.setContent('\n' + lines.join('\n'));
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
  }

  function updateChainPanel(
    chainSteps: string[],
    hopDetails?: Array<{ from: string; to: string; duration: number }>,
  ): void {
    if (hopDetails && hopDetails.length > 0) {
      const lines: string[] = [];

      // Draw agents
      for (let i = 0; i < hopDetails.length; i++) {
        const { from, to, duration } = hopDetails[i];
        const n1 = from.padEnd(10);
        const arrow = ` \u2500\u2500\u2500\u251c\u27a4 `;
        const n2 = to.padEnd(10);
        const dur = `{gray-fg}${duration}ms{/}`;
        const boxFrom = `{cyan-fg}\u250c${'\u2500'.repeat(12)}\u2510{/}`;
        const boxTo = `{green-fg}\u250c${'\u2500'.repeat(12)}\u2510{/}`;
        const boxBottom = `\u2514${'\u2500'.repeat(12)}\u2518`;

        lines.push(`  ${boxFrom}`);
        lines.push(
          `  {cyan-fg}\u2502{/} {bold}${n1}{/}{cyan-fg}\u2502{/}${arrow}{green-fg}\u2502{/} {bold}${n2}{/}{green-fg}\u2502{/}  ${dur}`,
        );
        lines.push(`  ${boxBottom}${' '.repeat(arrow.length)}${boxBottom}`);
      }

      chainPanel.setContent(lines.join('\n'));
    } else if (chainSteps.length === 0) {
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

  function renderTree(): void {
    const tree = engine.scheduler.getTree();
    if (tree.length === 0) {
      treePanel.setContent('  {gray-fg}No tasks.{/}');
      screen.render();
      return;
    }

    const lines: string[] = [];

    function renderNode(node: any, depth: number): void {
      const prefix = '  ' + '  '.repeat(depth);
      const typeIcon: Record<string, string> = {
        mission: '{bold}{magenta-fg}\u25c8{/}',
        quest: '{cyan-fg}\u25c6{/}',
        task: '{white-fg}\u2022{/}',
        urgent: '{bold}{red-fg}\u26a1{/}',
        sidequest: '{yellow-fg}\u26a0{/}',
      };
      const icon = typeIcon[node.type ?? 'task'] ?? '{white-fg}\u2022{/}';

      const statusIcon: Record<string, string> = {
        running: '{green-fg}\u25cf{/}',
        queued: '{gray-fg}\u25cb{/}',
        completed: '{green-fg}\u2713{/}',
        failed: '{red-fg}\u2717{/}',
        paused: '{yellow-fg}\u23f8{/}',
        blocked: '{gray-fg}\u23f3{/}',
        pending_review: '{yellow-fg}?{/}',
      };
      const sIcon = statusIcon[node.status] ?? '{gray-fg}-{/}';

      let line = `${prefix}${icon} ${node.description}`;
      if (node.progress !== undefined && node.progress >= 0) {
        line += ` {gray-fg}${node.progress}%{/}`;
      }
      if (node.type === 'mission' && node.id === engine.scheduler.tree.getActiveMission()?.id) {
        line += ' {bold}{magenta-fg}[MAIN]{/}';
      }
      if (node.status === 'running') {
        line += ' {green-fg}\u25c0{/}';
      }
      lines.push(`  ${sIcon} ${line}`);

      for (const child of node.children ?? []) {
        renderNode(child, depth + 1);
      }
    }

    for (const node of tree) {
      renderNode(node, 0);
      lines.push('');
    }

    treePanel.setContent(lines.join('\n'));
    treePanel.setScrollPerc(100);
    screen.render();
  }

  unsubs.push(
    engine.eventBus.subscribe('agent.state_changed', (_t, p) => {
      const e = p as any;
      if (e.toState === 'working') {
        log('\u25b6', `${e.agentId} ${e.fromState} \u2192 {green-fg}${e.toState}{/}`, '{cyan-fg}');
      }
      updateAgentPanel();
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('hop.recorded', (_t, p) => {
      const e = p as any;
      hopCount++;
      if (e.to) {
        currentHops.push(`${e.from} \u2192 ${e.to}`);
        currentHopDetails.push({ from: e.from, to: e.to, duration: e.duration });
        log(
          '\u2192',
          `${e.from} \u2192 {cyan-fg}${e.to}{/}  {gray-fg}(${e.duration}ms){/}`,
          '{cyan-fg}',
        );
      }
      updateChainPanel(currentHops, currentHopDetails);
      updateStats();
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('task.completed', (_t, p) => {
      const e = p as any;
      taskCount++;
      currentTask = null;
      log(
        '\u2713',
        `{green-fg}${e.taskId}{/}: {bold}${e.status}{/bold}  ({e.hops} hops)`,
        '{green-fg}',
      );
      currentHops = [];
      currentHopDetails = [];
      updateChainPanel([]);
      updateStats();
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('task.progress_changed', () => {
      if (showTreePanel) renderTree();
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('anomaly.detected', (_t, p) => {
      const e = p as any;
      log('\u26a0', `{red-fg}${e.type}{/}${e.agentId ? ' (' + e.agentId + ')' : ''}`, '{red-fg}');
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('system.degradation_changed', (_t, p) => {
      const e = p as any;
      degradationLevel = e.level;
      log(
        e.level >= 3 ? '{red-fg}\u26a0{/}' : '{yellow-fg}\u26a0{/}',
        `Degradation L${e.level}`,
        e.level >= 3 ? '{red-fg}' : '{yellow-fg}',
      );
      updateStats();
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('intervention.executed', (_t, p) => {
      const e = p as any;
      log('\u2139', `{yellow-fg}${e.type}{/}`, '{yellow-fg}');
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('hitl.requested', () => {
      updateApprovalPanel();
      updateStats();
    }),
  );
  unsubs.push(
    engine.eventBus.subscribe('hitl.resolved', () => {
      updateApprovalPanel();
      updateStats();
    }),
  );

  unsubs.push(
    engine.eventBus.subscribe('agent.response', (_t, p) => {
      const e = p as any;
      log(
        '\u2192',
        `{cyan-fg}${e.agentId}{/} responded (${e.viewCount} views${e.hasInteraction ? ', awaiting input' : ''})`,
        '{cyan-fg}',
      );
      if (e.viewCount > 0) {
        chainPanel.pushLine(`  {cyan-fg}Agent ${e.agentId} produced ${e.viewCount} view(s){/}`);
        chainPanel.setScrollPerc(100);
        screen.render();
      }
    }),
  );

  async function executeInTui(task: string): Promise<void> {
    if (!task) return;
    if (task !== '' && !commandHistory.includes(task)) {
      commandHistory.push(task);
      if (commandHistory.length > 50) commandHistory.shift();
    }
    historyIdx = commandHistory.length;
    input.clearValue();
    input.readInput();

    currentTask = task;
    currentHops = [];
    currentHopDetails = [];
    cancelled = false;
    log('\u25b6', `Running: {yellow-fg}${task}{/}`, '{cyan-fg}');
    updateChainPanel([`Analyzing: ${task}`]);
    updateStats();
    input.hide();
    screen.render();

    try {
      const result = await engine.executeTask(task);
      if (cancelled) {
        log('\u2717', '{yellow-fg}Cancelled{/}', '{yellow-fg}');
      } else if (currentHopDetails.length > 0) {
        updateChainPanel([], currentHopDetails);
      } else {
        updateChainPanel([task, `\u2713 ${result.status}`]);
      }
    } catch (err) {
      log('\u2717', `{red-fg}Error: ${String(err)}{/}`, '{red-fg}');
    }

    currentTask = null;
    cancelled = false;
    input.show();
    screen.render();
  }

  input.on('submit', (value: string) => {
    const raw = value.trim();
    if (!raw) return;

    // REPL commands (prefix /)
    if (raw.startsWith('/')) {
      handleCommand(raw.slice(1));
      return;
    }

    executeInTui(raw);
  });

  async function handleCommand(cmd: string): Promise<void> {
    const [action, ...args] = cmd.split(/\s+/);

    input.clearValue();
    input.readInput();
    input.hide();
    screen.render();

    switch (action) {
      case 'status': {
        const agents = engine.getAgentPool().getAllAgents();
        const lines = agents.map((a) => {
          const caps = a.capabilities.map((c) => c.type).join(', ');
          return `  {bold}${a.name}{/}  {gray-fg}${a.state}{/}  [{caps}]`;
        });
        chainPanel.setContent(`  {cyan-fg}/status{/}\n\n${lines.join('\n')}`);
        log('\u25b6', 'status', '{cyan-fg}');
        break;
      }
      case 'list': {
        const tasks = engine.getScheduler().getAllTasks();
        const lines = tasks.map((t) => `  ${t.taskId.padEnd(24)} {gray-fg}${t.status}{/}`);
        chainPanel.setContent(
          `  {cyan-fg}/list{/}\n\n${lines.length > 0 ? lines.join('\n') : '  {gray-fg}No tasks.{/}'}`,
        );
        log('\u25b6', `list (${tasks.length} tasks)`, '{cyan-fg}');
        break;
      }
      case 'logs': {
        const taskId = args[0];
        if (!taskId) {
          chainPanel.setContent('  {red-fg}Usage: /logs <taskId>{/}');
          break;
        }
        const hops = await engine.stateStore.loadTaskHops(taskId);
        const lines = hops.map(
          (h, i) =>
            `  [${i + 1}] ${h.fromAgent} \u2192 ${h.toAgent || '{gray-fg}(done){/}'}  {gray-fg}${h.duration}ms{/}`,
        );
        chainPanel.setContent(
          `  {cyan-fg}/logs ${taskId}{/}  {gray-fg}(${hops.length} hops){/}\n\n${lines.length > 0 ? lines.join('\n') : '  {gray-fg}No hops recorded.{/}'}`,
        );
        log('\u25b6', `logs ${taskId}`, '{cyan-fg}');
        break;
      }
      case 'views': {
        const registry = engine.rendererRegistry;
        const renderers = registry.getAll();
        const lines = renderers.map((r) => `  {bold}${r.type}{/}  {gray-fg}${r.description}{/}`);
        chainPanel.setContent(
          `  {cyan-fg}/views{/}  {gray-fg}(${renderers.length} renderers){/}\n\n${lines.join('\n')}`,
        );
        log('\u25b6', `views (${renderers.length} renderers)`, '{cyan-fg}');
        break;
      }
      case 'backlog': {
        const backlog = engine.scheduler.tree.getBacklog();
        const lines = backlog.map((m) => `  {cyan-fg}${m.id}{/}  {gray-fg}${m.description}{/}`);
        chainPanel.setContent(
          `  {cyan-fg}/backlog{/}  {gray-fg}(${backlog.length} paused){/}\n\n${lines.length > 0 ? lines.join('\n') : '  {gray-fg}No paused missions.{/}'}`,
        );
        log('\u25b6', `backlog (${backlog.length} missions)`, '{cyan-fg}');
        break;
      }

      case 'restore': {
        const missionId = args[0];
        if (!missionId) {
          chainPanel.setContent('  {red-fg}Usage: /restore <missionId>{/}');
          break;
        }
        const ok = engine.scheduler.tree.restoreFromBacklog(missionId);
        if (ok) {
          chainPanel.setContent(`  {green-fg}Restored mission: ${missionId}{/}`);
          log('\u25b6', `Restored: ${missionId}`, '{green-fg}');
        } else {
          chainPanel.setContent(`  {red-fg}Not found in backlog: ${missionId}{/}`);
        }
        break;
      }

      case 'switch': {
        const missionId = args[0];
        if (!missionId) {
          chainPanel.setContent('  {red-fg}Usage: /switch <missionId>{/}');
          break;
        }
        const ok = engine.scheduler.tree.setActiveMission(missionId);
        if (ok) {
          chainPanel.setContent(`  {green-fg}Switched active mission to: ${missionId}{/}`);
          log('\u25b6', `Switched to mission: ${missionId}`, '{green-fg}');
        } else {
          chainPanel.setContent(`  {red-fg}Mission not found: ${missionId}{/}`);
        }
        break;
      }

      case 'help': {
        chainPanel.setContent(
          '  {cyan-fg}Commands:{/}\n\n' +
            '  {bold}/status{/}        Show agent pool\n' +
            '  {bold}/list{/}          List tasks\n' +
            '  {bold}/logs <id>{/}     View task hops\n' +
            '  {bold}/approve <id>{/}  Approve pending request\n' +
            '  {bold}/reject <id>{/}   Reject pending request\n' +
            '  {bold}/pending{/}       List pending approvals\n' +
            '  {bold}/views{/}         Show view renderer status\n' +
            '  {bold}/backlog{/}      List paused missions\n' +
            '  {bold}/restore <id>{/}  Restore mission from backlog\n' +
            '  {bold}/switch <id>{/}   Switch active mission\n' +
            '  {bold}/help{/}          This message\n' +
            '  {yellow-fg}Key: a{/} approve first  {yellow-fg}r{/} reject first\n\n' +
            '  {bold}<any text>{/}      Run a task through the chain',
        );
        break;
      }
      default: {
        chainPanel.setContent(
          `  {red-fg}Unknown command: /${action}{/}\n  Type {bold}/help{/} for commands.`,
        );
        break;
      }
    }

    input.show();
    screen.render();
  }

  // Approval panel keyboard shortcuts
  screen.key(['a'], () => {
    const pending = engine.hitlManager.getPending();
    if (pending.length === 0) return;
    engine.hitlManager.approve(pending[0].id, 'tui');
    log('\u2713', `Approved: {green-fg}${pending[0].id}{/}`, '{green-fg}');
    updateApprovalPanel();
    updateStats();
  });

  screen.key(['r'], () => {
    const pending = engine.hitlManager.getPending();
    if (pending.length === 0) return;
    engine.hitlManager.reject(pending[0].id, 'tui');
    log('\u2717', `Rejected: {yellow-fg}${pending[0].id}{/}`, '{yellow-fg}');
    updateApprovalPanel();
    updateStats();
  });

  // Command history navigation with ↑/↓
  input.key(['up', 'down'], (ch: any, key: { name: string }) => {
    if (commandHistory.length === 0) return;
    if (key.name === 'up') {
      historyIdx = Math.max(0, historyIdx - 1);
    } else {
      historyIdx = Math.min(commandHistory.length - 1, historyIdx + 1);
    }
    input.setValue(commandHistory[historyIdx] ?? '');
    screen.render();
  });

  screen.key(['t'], () => {
    showTreePanel = !showTreePanel;
    if (showTreePanel) {
      chainPanel.hide();
      treePanel.show();
      renderTree();
    } else {
      treePanel.hide();
      chainPanel.show();
      screen.render();
    }
  });

  // Ctrl+L clear log
  screen.key(['C-l'], () => {
    logPanel.setContent('');
    screen.render();
  });

  screen.key(['escape', 'c'], () => {
    if (currentTask) {
      cancelled = true;
      log('\u2717', '{yellow-fg}Cancelling task...{/}', '{yellow-fg}');
    }
  });

  screen.key(['q', 'C-c'], () => {
    for (const u of unsubs) u();
    process.exit(0);
  });

  input.focus();
  updateAgentPanel();
  updateChainPanel([]);
  updateApprovalPanel();
  updateStats();
  screen.render();
}
