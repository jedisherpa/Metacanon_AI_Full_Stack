const steps = [
  {
    id: 's01_welcome',
    title: 'Welcome',
    objective: 'Choose Quick Setup or Advanced Setup.',
    command: 'cargo run --quiet -- setup --provider qwen_local',
    apis: ['finalize_setup_compute_selection(runtime, provider?)'],
    mockup: '../handover/mockups/desktop/01-welcome.webp',
  },
  {
    id: 's02_system_check',
    title: 'System Check',
    objective: 'Run pass/warn/fail checks before configuration.',
    command: 'cargo run --quiet -- system-check',
    apis: ['run_system_check(runtime)'],
    mockup: '../handover/mockups/desktop/02-system-check.webp',
  },
  {
    id: 's03_compute',
    title: 'Compute Selection',
    objective: 'Pick providers, global default, and cloud priority.',
    command: 'cargo run --quiet -- setup --provider qwen_local --cloud-priority openai,anthropic,moonshot_kimi,grok',
    apis: [
      'get_compute_options(runtime)',
      'set_global_compute_provider(runtime, provider_id)',
      'set_provider_priority(runtime, cloud_priority)',
    ],
    mockup: '../handover/mockups/desktop/03-compute-selection.webp',
  },
  {
    id: 's04_provider_cfg',
    title: 'Provider Configuration',
    objective: 'Configure keys/endpoints and test provider health.',
    command: 'cargo run --quiet -- health',
    apis: ['update_provider_config(runtime, provider_id, patch)', 'get_provider_health(runtime)'],
    mockup: '../handover/mockups/desktop/04-provider-config.webp',
  },
  {
    id: 's05_security',
    title: 'Security & Persistence',
    objective: 'Set snapshot path, encryption, and secret backend mode.',
    command: 'cargo run --quiet -- setup --snapshot-encryption --snapshot-passphrase secret --secret-backend dual_write',
    apis: [
      'get_security_persistence_settings(runtime)',
      'update_security_persistence_settings(runtime, ...)',
      'save_runtime_snapshot(runtime, path)',
    ],
    mockup: '../handover/mockups/desktop/05-security-persistence.webp',
  },
  {
    id: 's06_observability',
    title: 'Observability',
    objective: 'Configure retention and log level for dual-tier logs.',
    command: 'cargo run --quiet -- setup --retention-days 90 --log-level info',
    apis: ['get_observability_status(runtime)', 'update_observability_settings(runtime, retention_days, log_level)'],
    mockup: '../handover/mockups/desktop/06-observability.webp',
  },
  {
    id: 's07_review',
    title: 'Review & Install',
    objective: 'Validate readiness and resolve blocking issues.',
    command: 'cargo run --quiet -- review',
    apis: ['get_install_review_summary(runtime)'],
    mockup: '../handover/mockups/desktop/07-review-install.webp',
  },
  {
    id: 's08_done',
    title: 'Done',
    objective: 'Flush/export snapshot and open the dashboard.',
    command: 'cargo run --quiet -- snapshot-flush',
    apis: ['flush_runtime_auto_snapshot(runtime)'],
    mockup: '../handover/mockups/desktop/08-done.webp',
  },
];

const dom = {
  stepId: document.getElementById('stepId'),
  stepTitle: document.getElementById('stepTitle'),
  stepObjective: document.getElementById('stepObjective'),
  command: document.getElementById('command'),
  apiList: document.getElementById('apiList'),
  mockup: document.getElementById('mockup'),
  steps: document.getElementById('steps'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
};

let currentIndex = 0;

function renderStepList() {
  dom.steps.innerHTML = '';
  steps.forEach((step, index) => {
    const li = document.createElement('li');
    li.className = `step-item ${index === currentIndex ? 'active' : ''}`;
    li.innerHTML = `<strong>${index + 1}. ${step.title}</strong><small>${step.id}</small>`;
    li.addEventListener('click', () => {
      currentIndex = index;
      render();
    });
    dom.steps.appendChild(li);
  });
}

function render() {
  const step = steps[currentIndex];
  dom.stepId.textContent = step.id;
  dom.stepTitle.textContent = step.title;
  dom.stepObjective.textContent = step.objective;
  dom.command.textContent = step.command;
  dom.mockup.src = step.mockup;
  dom.apiList.innerHTML = '';
  step.apis.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    dom.apiList.appendChild(li);
  });

  dom.prev.disabled = currentIndex === 0;
  dom.next.disabled = currentIndex === steps.length - 1;
  renderStepList();
}

dom.prev.addEventListener('click', () => {
  currentIndex = Math.max(0, currentIndex - 1);
  render();
});

dom.next.addEventListener('click', () => {
  currentIndex = Math.min(steps.length - 1, currentIndex + 1);
  render();
});

render();
