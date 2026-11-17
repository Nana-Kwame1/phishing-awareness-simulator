'use strict';

const STORAGE_KEY = 'phishsafe_demo_v1';

const TEMPLATES = {
  shared_doc: {
    label: 'Shared document',
    subject: 'Action required: document shared with you',
    senderName: 'Maya Chen',
    senderEmail: 'maya.chen@doc-share.example',
    preview: 'A document was shared with you. Please review it today.',
    cta: 'Review document',
    landingTitle: 'Secure Document Portal',
    landingNote: 'Sign in to view the shared document.',
  },
  password_reset: {
    label: 'Password reset',
    subject: 'Your account access needs attention',
    senderName: 'IT Support',
    senderEmail: 'support@account-alert.example',
    preview: 'We detected unusual activity. Verify your account now.',
    cta: 'Verify account',
    landingTitle: 'Account Verification',
    landingNote: 'Confirm your details to restore access.',
  },
  invoice: {
    label: 'Invoice / payment',
    subject: 'Invoice ready for your approval',
    senderName: 'Billing Team',
    senderEmail: 'billing@invoice-portal.example',
    preview: 'An invoice is waiting for your approval.',
    cta: 'Open invoice',
    landingTitle: 'Invoice Portal',
    landingNote: 'Sign in to approve the attached invoice.',
  },
};

const EVENT_LABELS = {
  opened: 'Opened email',
  clicked: 'Clicked link',
  submitted: 'Submitted fake form',
  reported: 'Reported as phishing',
  completed_training: 'Completed training',
};

function emptyState() {
  return { campaigns: [], events: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.campaigns) || !Array.isArray(parsed.events)) {
      return emptyState();
    }
    return parsed;
  } catch (error) {
    return emptyState();
  }
}

let state = loadState();
let toastMessage = '';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function baseUrl() {
  return location.href.split('#')[0];
}

function navigate(path) {
  location.hash = path;
}

function setToast(message) {
  toastMessage = message;
}

function getCampaign(id) {
  return state.campaigns.find((campaign) => String(campaign.id) === String(id));
}

function getParticipant(token) {
  for (const campaign of state.campaigns) {
    const participant = campaign.participants.find((item) => item.token === token);
    if (participant) return { participant, campaign };
  }
  return null;
}

function findParticipantName(id) {
  for (const campaign of state.campaigns) {
    const participant = campaign.participants.find((item) => item.id === id);
    if (participant) return participant.name;
  }
  return 'Unknown participant';
}

function eventsForCampaign(campaign) {
  const ids = new Set(campaign.participants.map((participant) => participant.id));
  return state.events.filter((event) => ids.has(event.participantId));
}

function statsFor(campaign) {
  const events = eventsForCampaign(campaign);
  const uniqueCount = (type) => new Set(
    events.filter((event) => event.type === type).map((event) => event.participantId)
  ).size;
  return {
    total: campaign.participants.length,
    opened: uniqueCount('opened'),
    clicked: uniqueCount('clicked'),
    submitted: uniqueCount('submitted'),
    reported: uniqueCount('reported'),
    trained: uniqueCount('completed_training'),
  };
}

function logEvent(participant, type, detail = '') {
  const alreadyLogged = state.events.some(
    (event) => event.participantId === participant.id && event.type === type
  );
  if (alreadyLogged) return;
  state.events.push({
    id: uid(),
    participantId: participant.id,
    type,
    detail,
    createdAt: nowIso(),
  });
  saveState();
}

function parseRecipients(raw) {
  return raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.indexOf(',');
      if (comma === -1) {
        const email = line;
        return { name: email.split('@')[0], email };
      }
      return {
        name: line.slice(0, comma).trim(),
        email: line.slice(comma + 1).trim(),
      };
    })
    .filter((person) => person.email.includes('@') && person.email.includes('.'));
}

function renderShell(content, options = {}) {
  const { sim = false, title = 'PhishSafe' } = options;
  document.title = title + ' · PhishSafe';
  const app = document.getElementById('app');

  if (sim) {
    app.innerHTML = `
      <div class="sim-banner">
        Training simulation — do not enter real passwords or sensitive data.
        <a href="#/dashboard">Back to dashboard</a>
      </div>
      <main class="sim-main">${content}</main>
    `;
    return;
  }

  const toast = toastMessage
    ? `<div class="flash-stack"><div class="flash flash-success">${esc(toastMessage)}</div></div>`
    : '';

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/dashboard">
        <span class="brand-mark">P</span>
        <span>PhishSafe</span>
      </a>
      <nav class="nav">
        <a href="#/dashboard">Dashboard</a>
        <a href="#/campaigns/new">New campaign</a>
        <a href="#/inbox">Simulated inbox</a>
      </nav>
    </header>
    <main class="container">
      ${toast}
      ${content}
    </main>
    <footer class="footer">
      Browser-only demo · Data stays in this browser · No emails sent, no passwords stored
    </footer>
  `;

  if (toastMessage) {
    const message = toastMessage;
    window.setTimeout(() => {
      if (toastMessage === message) {
        toastMessage = '';
        document.querySelector('.flash-stack')?.remove();
      }
    }, 3000);
  }
}

function renderDashboard() {
  const campaigns = state.campaigns;
  const participants = campaigns.reduce((total, campaign) => total + campaign.participants.length, 0);
  let clicked = 0;
  let submitted = 0;
  let reported = 0;
  campaigns.forEach((campaign) => {
    const stats = statsFor(campaign);
    clicked += stats.clicked;
    submitted += stats.submitted;
    reported += stats.reported;
  });

  const rows = campaigns.map((campaign) => {
    const stats = statsFor(campaign);
    const rate = stats.total ? Math.round((stats.clicked / stats.total) * 100) : 0;
    const template = TEMPLATES[campaign.templateKey] || TEMPLATES.shared_doc;
    return `
      <tr>
        <td>
          <strong>${esc(campaign.name)}</strong>
          <div class="cell-sub">Created ${esc(campaign.createdAt.slice(0, 10))}</div>
        </td>
        <td><span class="tag">${esc(template.label)}</span></td>
        <td>${stats.total}</td>
        <td>
          <div class="rate-cell">
            <div class="bar"><span style="width: ${rate}%"></span></div>
            <span>${rate}%</span>
          </div>
        </td>
        <td><span class="pill pill-danger">${stats.submitted}</span></td>
        <td><span class="pill pill-success">${stats.reported}</span></td>
        <td>
          ${campaign.launchedAt
            ? '<span class="status status-live">Launched</span>'
            : '<span class="status">Draft</span>'}
        </td>
        <td class="right">
          <a class="btn small" href="#/campaigns/${encodeURIComponent(campaign.id)}">View</a>
        </td>
      </tr>
    `;
  }).join('');

  const content = `
    <section class="page-head">
      <div>
        <p class="eyebrow">Awareness program</p>
        <h1>Phishing simulation dashboard</h1>
        <p class="subtext">Create campaigns, run safe simulations, and measure how your team responds.</p>
      </div>
      <a class="btn primary" href="#/campaigns/new">+ New campaign</a>
    </section>

    <section class="stat-grid">
      <div class="stat-card"><span class="stat-label">Campaigns</span><strong class="stat-value">${campaigns.length}</strong><span class="stat-foot">Total created</span></div>
      <div class="stat-card"><span class="stat-label">Participants</span><strong class="stat-value">${participants}</strong><span class="stat-foot">Across all campaigns</span></div>
      <div class="stat-card danger"><span class="stat-label">Clicked links</span><strong class="stat-value">${clicked}</strong><span class="stat-foot">Unique participants</span></div>
      <div class="stat-card success"><span class="stat-label">Reported</span><strong class="stat-value">${reported}</strong><span class="stat-foot">Unique participants</span></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Campaigns</h2>
          <p class="muted">Select a campaign to see participant-level results.</p>
        </div>
      </div>
      ${campaigns.length ? `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Campaign</th><th>Template</th><th>Participants</th><th>Click rate</th>
                <th>Submitted</th><th>Reported</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">✉</div>
          <h3>No campaigns yet</h3>
          <p>Create your first campaign to generate simulated emails and tracking links.</p>
          <a class="btn primary" href="#/campaigns/new">Create a campaign</a>
        </div>
      `}
    </section>
  `;
  renderShell(content);
}

function renderNewCampaign() {
  const options = Object.entries(TEMPLATES).map(([key, template]) => `
    <option value="${key}">${esc(template.label)} — ${esc(template.subject)}</option>
  `).join('');

  const content = `
    <section class="page-head">
      <div>
        <p class="eyebrow">Step 1 of 1</p>
        <h1>Create a phishing simulation</h1>
        <p class="subtext">Participants get a simulated inbox message and a safe training flow when they interact.</p>
      </div>
      <a class="btn" href="#/dashboard">Back to dashboard</a>
    </section>

    <div class="form-layout">
      <form class="panel form-panel" data-action="create-campaign">
        <div class="field">
          <label for="name">Campaign name</label>
          <input id="name" name="name" type="text" required placeholder="Q4 Security Awareness">
        </div>
        <div class="field">
          <label for="templateKey">Email template</label>
          <select id="templateKey" name="templateKey">${options}</select>
          <p class="hint">Choose the scenario participants will see in the simulated inbox.</p>
        </div>
        <div class="field">
          <label for="recipients">Participants</label>
          <textarea id="recipients" name="recipients" rows="9" required placeholder="Ada Lovelace, ada@example.com&#10;Grace Hopper, grace@example.com&#10;alan@example.com"></textarea>
          <p class="hint">One per line. Use <code>Name, email</code> or just an email address.</p>
        </div>
        <div class="form-actions">
          <button class="btn primary" type="submit">Create campaign</button>
          <a class="btn ghost" href="#/dashboard">Cancel</a>
        </div>
      </form>

      <aside class="panel info-panel">
        <h2>Safety by design</h2>
        <ul class="check-list">
          <li>No emails are sent from this demo.</li>
          <li>Each participant gets a unique simulated inbox link.</li>
          <li>The fake login form records only that it was submitted.</li>
          <li>Entered usernames and passwords are never stored.</li>
          <li>Every path ends in a short training lesson.</li>
        </ul>
        <div class="callout">
          <strong>Use responsibly.</strong>
          Only run this with people who have agreed to participate in security training.
        </div>
      </aside>
    </div>
  `;
  renderShell(content, { title: 'New campaign' });
}

function renderCampaignView(id) {
  const campaign = getCampaign(id);
  if (!campaign) {
    renderNotFound();
    return;
  }

  const stats = statsFor(campaign);
  const template = TEMPLATES[campaign.templateKey] || TEMPLATES.shared_doc;

  const participantRows = campaign.participants.map((participant) => {
    const link = `${baseUrl()}#/go/${participant.token}`;
    const has = (type) => state.events.some(
      (event) => event.participantId === participant.id && event.type === type
    );
    return `
      <tr>
        <td><strong>${esc(participant.name)}</strong></td>
        <td class="muted">${esc(participant.email)}</td>
        <td>
          <div class="copy-row">
            <input class="link-input" readonly value="${esc(link)}" onclick="this.select()">
            <button class="btn small" type="button" data-action="copy-link" data-link="${esc(link)}">Copy</button>
          </div>
        </td>
        <td>${has('opened') ? '✓' : '—'}</td>
        <td>${has('clicked') ? '✓' : '—'}</td>
        <td>${has('submitted') ? '✓' : '—'}</td>
        <td>${has('reported') ? '✓' : '—'}</td>
        <td>${has('completed_training') ? '✓' : '—'}</td>
      </tr>
    `;
  }).join('');

  const activity = eventsForCampaign(campaign)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map((event) => `
      <li>
        <span class="timeline-dot event-${event.type}"></span>
        <div>
          <strong>${esc(EVENT_LABELS[event.type] || event.type)}</strong>
          <div class="cell-sub">${esc(findParticipantName(event.participantId))} · ${esc(event.createdAt)}</div>
        </div>
      </li>
    `).join('');

  const content = `
    <section class="page-head">
      <div>
        <p class="eyebrow">${esc(template.label)} scenario</p>
        <h1>${esc(campaign.name)}</h1>
        <p class="subtext">
          Created ${esc(campaign.createdAt.slice(0, 10))}
          ${campaign.launchedAt ? ` · Launched ${esc(campaign.launchedAt.slice(0, 10))}` : ' · Draft'}
        </p>
      </div>
      <div class="button-row">
        <a class="btn" href="#/dashboard">Back</a>
        ${campaign.launchedAt ? '' : `
          <button class="btn primary" type="button" data-action="launch-campaign" data-id="${esc(campaign.id)}">Mark as launched</button>
        `}
      </div>
    </section>

    <section class="stat-grid five">
      <div class="stat-card"><span class="stat-label">Participants</span><strong class="stat-value">${stats.total}</strong></div>
      <div class="stat-card"><span class="stat-label">Opened</span><strong class="stat-value">${stats.opened}</strong></div>
      <div class="stat-card danger"><span class="stat-label">Clicked</span><strong class="stat-value">${stats.clicked}</strong></div>
      <div class="stat-card warning"><span class="stat-label">Submitted</span><strong class="stat-value">${stats.submitted}</strong></div>
      <div class="stat-card success"><span class="stat-label">Reported</span><strong class="stat-value">${stats.reported}</strong></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Participants</h2>
          <p class="muted">Share a unique simulation link with each participant, or open the simulated inbox.</p>
        </div>
        <a class="btn small" href="#/inbox">Open simulated inbox</a>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Simulation link</th>
              <th>Opened</th><th>Clicked</th><th>Submitted</th><th>Reported</th><th>Trained</th>
            </tr>
          </thead>
          <tbody>${participantRows}</tbody>
        </table>
      </div>
    </section>

    <div class="two-col">
      <section class="panel">
        <div class="panel-head"><h2>Recent activity</h2></div>
        ${activity ? `<ul class="timeline">${activity}</ul>` : '<p class="muted center">No activity yet.</p>'}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Simulation controls</h2></div>
        <p class="muted">Reset tracking to rerun the campaign, or delete it permanently.</p>
        <div class="button-row stack">
          <button class="btn" type="button" data-action="reset-campaign" data-id="${esc(campaign.id)}">Reset tracking</button>
          <button class="btn danger" type="button" data-action="delete-campaign" data-id="${esc(campaign.id)}">Delete campaign</button>
        </div>
        <div class="callout subtle">
          <strong>Reminder:</strong> This demo never sends real email and never stores typed passwords.
        </div>
      </section>
    </div>
  `;
  renderShell(content, { title: campaign.name });
}

function renderInbox() {
  const messages = state.campaigns.flatMap((campaign) => campaign.participants.map((participant) => ({
    campaign,
    participant,
    template: TEMPLATES[campaign.templateKey] || TEMPLATES.shared_doc,
  })));

  const cards = messages.map(({ campaign, participant, template }) => `
    <article class="message-card">
      <div class="message-avatar">${esc(template.senderName[0])}</div>
      <div class="message-body">
        <div class="message-meta">
          <span class="tag">${esc(campaign.name)}</span>
          ${campaign.launchedAt
            ? '<span class="status status-live">Launched</span>'
            : '<span class="status">Draft</span>'}
        </div>
        <h3>${esc(template.subject)}</h3>
        <p class="muted">${esc(template.senderName)} &lt;${esc(template.senderEmail)}&gt; → ${esc(participant.email)}</p>
        <p>${esc(template.preview)}</p>
      </div>
      <a class="btn primary small" href="#/go/${encodeURIComponent(participant.token)}">Open message</a>
    </article>
  `).join('');

  const content = `
    <section class="page-head">
      <div>
        <p class="eyebrow">Safe delivery channel</p>
        <h1>Simulated inbox</h1>
        <p class="subtext">These are the messages participants would receive. Opening one records an open event.</p>
      </div>
    </section>
    <section class="panel">
      ${cards ? `<div class="message-list">${cards}</div>` : `
        <div class="empty-state">
          <div class="empty-icon">✉</div>
          <h3>Inbox is empty</h3>
          <p>Create a campaign to generate simulated messages.</p>
          <a class="btn primary" href="#/campaigns/new">Create a campaign</a>
        </div>
      `}
    </section>
  `;
  renderShell(content, { title: 'Simulated inbox' });
}

function renderEmail(token) {
  const found = getParticipant(token);
  if (!found) {
    renderNotFound(true);
    return;
  }
  logEvent(found.participant, 'opened', 'Simulated email opened');
  const template = TEMPLATES[found.campaign.templateKey] || TEMPLATES.shared_doc;

  renderShell(`
    <div class="mail-shell">
      <div class="mail-toolbar">
        <span class="mail-toolbar-title">Inbox</span>
        <button class="btn ghost small" type="button" data-action="report" data-token="${esc(token)}">Report phishing</button>
      </div>
      <article class="mail-message">
        <div class="mail-meta">
          <div class="sender-avatar">${esc(template.senderName[0])}</div>
          <div>
            <strong>${esc(template.senderName)}</strong>
            <div class="cell-sub">&lt;${esc(template.senderEmail)}&gt;</div>
          </div>
          <div class="mail-to">to ${esc(found.participant.email)}</div>
        </div>
        <h1 class="mail-subject">${esc(template.subject)}</h1>
        <div class="mail-content">
          <p>Hi ${esc(found.participant.name.split(' ')[0])},</p>
          <p>${esc(template.preview)}</p>
          <p>Please use the secure link below so we can keep your account protected.</p>
          <p class="center">
            <a class="btn primary large" href="#/phish/${encodeURIComponent(token)}">${esc(template.cta)}</a>
          </p>
          <p class="muted small-text">If you were not expecting this message, you can report it using the button above.</p>
        </div>
      </article>
    </div>
  `, { sim: true, title: template.subject });
}

function renderPhish(token) {
  const found = getParticipant(token);
  if (!found) {
    renderNotFound(true);
    return;
  }
  logEvent(found.participant, 'clicked', 'Clicked email call-to-action');
  const template = TEMPLATES[found.campaign.templateKey] || TEMPLATES.shared_doc;

  renderShell(`
    <div class="login-shell">
      <div class="login-card">
        <div class="login-logo">${esc(template.landingTitle[0])}</div>
        <h1>${esc(template.landingTitle)}</h1>
        <p class="muted">${esc(template.landingNote)}</p>
        <form class="login-form" data-action="fake-login" data-token="${esc(token)}">
          <div class="field">
            <label for="email">Email address</label>
            <input id="email" name="email" type="email" value="${esc(found.participant.email)}" autocomplete="off">
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" placeholder="Do not enter a real password" autocomplete="off">
          </div>
          <button class="btn primary block" type="submit">Continue</button>
        </form>
        <p class="fine-print">Training simulation: any text entered above is discarded and never saved.</p>
      </div>
    </div>
  `, { sim: true, title: template.landingTitle });
}

function renderTraining(token, params) {
  const found = getParticipant(token);
  if (!found) {
    renderNotFound(true);
    return;
  }
  const reason = params.get('reason') || 'opened';
  const done = params.get('done') === '1';
  const template = TEMPLATES[found.campaign.templateKey] || TEMPLATES.shared_doc;

  const heading = done
    ? 'Training complete'
    : reason === 'reported'
      ? 'Nice work — you reported it'
      : reason === 'submitted'
        ? 'That was a simulated phishing page'
        : 'Let’s pause before clicking';

  const intro = reason === 'reported'
    ? 'You flagged the message before entering any information. Reporting suspicious email is one of the fastest ways to protect the whole organization.'
    : reason === 'submitted'
      ? 'You entered details into a fake sign-in page. In a real attack, those credentials would be stolen. Nothing you typed was saved here — this was a safe simulation.'
      : 'Opening a suspicious message is not the real failure. The risk starts when you click links, download attachments, or enter credentials.';

  renderShell(`
    <div class="training-shell">
      <div class="training-head">
        <span class="badge">Micro-lesson</span>
        <h1>${esc(heading)}</h1>
        <p>${esc(intro)}</p>
      </div>

      <section class="panel sim-panel">
        <h2>Red flags in this simulation</h2>
        <ul class="flag-list">
          <li><strong>Unexpected sender.</strong> The message came from <code>${esc(template.senderEmail)}</code>, not a trusted company domain.</li>
          <li><strong>Urgency.</strong> Phrases like “action required” push you to act before thinking.</li>
          <li><strong>Generic greeting.</strong> “Hi ${esc(found.participant.name.split(' ')[0])}” can be automated and personalized from public data.</li>
          <li><strong>Lookalike destination.</strong> The button led to a page designed to resemble a legitimate portal.</li>
          <li><strong>Credential request.</strong> Legitimate teams rarely ask you to confirm a password through an email link.</li>
        </ul>
      </section>

      <section class="panel sim-panel">
        <h2>What to do next time</h2>
        <ol class="steps">
          <li>Hover over links and check the real destination before clicking.</li>
          <li>Open the service directly in your browser instead of using the email link.</li>
          <li>Check the sender’s full email address, not just the display name.</li>
          <li>Report suspicious messages using your organization’s reporting button.</li>
          <li>Never enter a password on a page you reached from an unexpected message.</li>
        </ol>
      </section>

      ${done ? `
        <div class="success-box"><strong>✓ Lesson completed.</strong> Your response has been recorded in the campaign results.</div>
        <a class="btn primary block" href="#/dashboard">Return to dashboard</a>
      ` : `
        <form data-action="complete-training" data-token="${esc(token)}" data-reason="${esc(reason)}">
          <button class="btn primary block" type="submit">I understand — complete training</button>
        </form>
      `}
    </div>
  `, { sim: true, title: 'Training' });
}

function renderNotFound(sim = false) {
  renderShell(`
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h3>Not found</h3>
      <p>That simulation link does not exist in this browser’s demo data.</p>
      <a class="btn primary" href="#/dashboard">Back to dashboard</a>
    </div>
  `, { sim, title: 'Not found' });
}

function route() {
  let hash = location.hash.replace(/^#\/?/, '');
  if (!hash) hash = 'dashboard';
  const [pathPart, queryPart] = hash.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');

  if (parts[0] === 'dashboard') renderDashboard();
  else if (parts[0] === 'campaigns' && parts[1] === 'new') renderNewCampaign();
  else if (parts[0] === 'campaigns' && parts[1]) renderCampaignView(parts[1]);
  else if (parts[0] === 'inbox') renderInbox();
  else if (parts[0] === 'go' && parts[1]) renderEmail(parts[1]);
  else if (parts[0] === 'phish' && parts[1]) renderPhish(parts[1]);
  else if (parts[0] === 'training' && parts[1]) renderTraining(parts[1], params);
  else renderDashboard();
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();
  const action = form.dataset.action;

  if (action === 'create-campaign') {
    const name = form.elements.name.value.trim();
    const templateKey = form.elements.templateKey.value;
    const recipients = parseRecipients(form.elements.recipients.value);
    if (!name || !TEMPLATES[templateKey] || recipients.length === 0) {
      setToast('Add a name, template, and at least one valid participant.');
      route();
      return;
    }
    const campaign = {
      id: uid(),
      name,
      templateKey,
      createdAt: nowIso(),
      launchedAt: null,
      participants: recipients.map((person) => ({
        id: uid(),
        name: person.name,
        email: person.email,
        token: uid(),
      })),
    };
    state.campaigns.unshift(campaign);
    saveState();
    setToast(`Campaign created with ${recipients.length} participant(s).`);
    navigate(`/campaigns/${encodeURIComponent(campaign.id)}`);
    return;
  }

  if (action === 'fake-login') {
    const token = form.dataset.token;
    const found = getParticipant(token);
    if (found) {
      logEvent(found.participant, 'submitted', 'Fake form submitted. No entered values were stored.');
    }
    navigate(`/training/${encodeURIComponent(token)}?reason=submitted`);
    return;
  }

  if (action === 'complete-training') {
    const token = form.dataset.token;
    const reason = form.dataset.reason || 'opened';
    const found = getParticipant(token);
    if (found) {
      logEvent(found.participant, 'completed_training', 'Training page completed');
    }
    navigate(`/training/${encodeURIComponent(token)}?reason=${encodeURIComponent(reason)}&done=1`);
  }
});

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (!element || element.tagName === 'FORM') return;
  const action = element.dataset.action;

  if (action === 'copy-link') {
    const link = element.dataset.link;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    setToast('Simulation link copied.');
    route();
    return;
  }

  if (action === 'launch-campaign') {
    const campaign = getCampaign(element.dataset.id);
    if (campaign) {
      campaign.launchedAt = nowIso();
      saveState();
      setToast('Campaign marked as launched.');
      route();
    }
    return;
  }

  if (action === 'reset-campaign') {
    const campaign = getCampaign(element.dataset.id);
    if (!campaign) return;
    const ids = new Set(campaign.participants.map((participant) => participant.id));
    state.events = state.events.filter((event) => !ids.has(event.participantId));
    campaign.launchedAt = null;
    saveState();
    setToast('Tracking data reset.');
    route();
    return;
  }

  if (action === 'delete-campaign') {
    const campaign = getCampaign(element.dataset.id);
    if (!campaign) return;
    if (!window.confirm('Delete this campaign and all its participants?')) return;
    const ids = new Set(campaign.participants.map((participant) => participant.id));
    state.campaigns = state.campaigns.filter((item) => item.id !== campaign.id);
    state.events = state.events.filter((event) => !ids.has(event.participantId));
    saveState();
    setToast('Campaign deleted.');
    navigate('/dashboard');
    return;
  }

  if (action === 'report') {
    const token = element.dataset.token;
    const found = getParticipant(token);
    if (found) {
      logEvent(found.participant, 'reported', 'Marked the message as suspicious');
    }
    navigate(`/training/${encodeURIComponent(token)}?reason=reported`);
  }
});

window.addEventListener('hashchange', route);
route();
