#!/usr/bin/env node

const command = process.argv[2] || "audit";

const plan = {
  projectName: "Ludovive",
  sprintName: process.env.TAIGA_SPRINT_NAME || "Ludovive MVP Putsch",
  epics: [
    "Transmission Core",
    "Module Import",
    "Participant State Model",
    "Dashboard Read Model",
    "Action and Rule Events",
    "Operational Putsch MVP",
    "Putsch MVP+",
    "Android Real Gestures",
    "Persistence and Reconnect"
  ],
  stories: [
    {
      subject: "Player read model exposes only playable current actions",
      epic: "Participant State Model",
      description: "Participant devices receive only their own state, public participant identities, and currently playable actions."
    },
    {
      subject: "Participant reconnect uses heartbeat and safe fallback to join screen",
      epic: "Transmission Core",
      description: "Returning devices mark themselves connected and recover gracefully when their stored session or device is invalid."
    },
    {
      subject: "Putsch Lite supports core market actions",
      epic: "Action and Rule Events",
      description: "Putsch Lite exposes copper share trades, arms/ammunition trades, and drug sales through module-declared actions."
    },
    {
      subject: "Facilitator dashboard shows an MVP control panel",
      epic: "Dashboard Read Model",
      description: "The dashboard highlights phase, connected devices, pending resolutions, and immediate table actions."
    },
    {
      subject: "Ready-to-play Putsch demo session can be created",
      epic: "Operational Putsch MVP",
      description: "A demo endpoint and dashboard button create a Putsch table with participants, devices, roles, authority, and opening message."
    },
    {
      subject: "Sessions persist to local JSON storage",
      epic: "Persistence and Reconnect",
      description: "Server state is saved to local JSON files and can be reloaded after a restart."
    },
    {
      subject: "Putsch player UI contains only current actions and private state",
      epic: "Putsch MVP+",
      description: "Replace raw/debug payloads with a clean mobile player surface showing role, resources, messages, alerts, and playable actions only."
    },
    {
      subject: "Putsch economy models cards resources and copper share market",
      epic: "Putsch MVP+",
      description: "Represent CF, CM, drugs, copper shares, vote ballots, inventories, current share price, market limits, exchanges, and audited score-relevant holdings."
    },
    {
      subject: "Putsch setup distributes role material from module declarations",
      epic: "Putsch MVP+",
      description: "Use module setup distributions to give participants their private role material, cards, copper shares, vote ballots, and inventories without manual JSON editing."
    },
    {
      subject: "Putsch copper mine market enforces price stock and buyer limits",
      epic: "Putsch MVP+",
      description: "Let players buy copper shares from the mine at the current price while transferring money, cards, shares, stock counters, and Paquito holdings atomically."
    },
    {
      subject: "Putsch score dashboard explains estimated standings",
      epic: "Dashboard Read Model",
      description: "Compute facilitator-visible scores from declarative resource scoring rules, including current copper share price and Paquito's special half-value rule."
    },
    {
      subject: "Putsch coup resolves hidden timed commitments automatically",
      epic: "Putsch MVP+",
      description: "Run coup declaration, facilitator-configured countdown, hidden attacker and defender commitments, automatic force comparison, power change, share price effect, and public/private summaries."
    },
    {
      subject: "Putsch hidden coup commitments are private and deadline enforced",
      epic: "Putsch MVP+",
      description: "Filter hidden commitments out of participant read models except for their own bid, expose commitment status, and reject late defense commitments after the countdown."
    },
    {
      subject: "Putsch election runs from ballot to college update",
      epic: "Putsch MVP+",
      description: "Open an election, collect one secret ballot per voter for promotion and elimination, tally results, handle ties, update the council, and publish the allowed result."
    },
    {
      subject: "Putsch council election can be finalized declaratively",
      epic: "Putsch MVP+",
      description: "Finalize the minister council election through a module-declared action that computes promoted and eliminated participants and writes council statuses."
    },
    {
      subject: "Putsch council phase resolution is guided and applies consequences",
      epic: "Putsch MVP+",
      description: "Guide the council phase resolution with attendees, embezzlement, decisions, facilitator validation, automatic financial consequences, public summary, and private audit."
    },
    {
      subject: "Modules expose UI templates and soundboard cues",
      epic: "Module Import",
      description: "Let imported games declare visual theme, gesture language, and event sound cues so Putsch and future games can carry their own table identity."
    },
    {
      subject: "Module loader validates reusable kit references",
      epic: "Module Import",
      description: "Validate module references for phases, mechanics, roles, resources, components, setup distributions, scoring states, market states, and sound cue phases at load time."
    },
    {
      subject: "Putsch MVP+ demo mode supports a 60-90 minute playtest",
      epic: "Putsch MVP+",
      description: "Provide seeded roles, resettable demo data, a facilitator checklist, critical rule tests, reconnect checks, and an exportable play log for a real table test."
    },
    {
      subject: "G1 canonical Android gesture event",
      epic: "Android Real Gestures",
      description: "Define one normalized Android gesture event with gesture, proximity, sourceDeviceId, targetDeviceId, transport, confidence, and payload, then convert it to the Ludovive server event shape."
    },
    {
      subject: "G2 proximity layer requires close phones for exchanges",
      epic: "Android Real Gestures",
      description: "Normalize Nearby Connections, BLE, NFC, QR, and manual fallback into proximity near so player-to-player exchanges cannot happen from another room."
    },
    {
      subject: "G3 sensor gesture classifier covers table motions",
      epic: "Android Real Gestures",
      description: "Classify pour, strike, parry, shake, face-down, ballot-drop, and tap-stack style motions with confidence while leaving rule resolution to the server."
    },
    {
      subject: "G4 Android gesture transport sends events to server",
      epic: "Android Real Gestures",
      description: "Post canonical gesture events to /sessions/:code/events and surface server acceptance or rejection to the Android UI."
    },
    {
      subject: "G5 two-phone gesture playtest proves no remote trades",
      epic: "Android Real Gestures",
      description: "Run a table playtest where two devices join a session, establish contact, perform an exchange gesture, and verify cross-room transactions fail."
    }
  ]
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function taigaBaseUrl() {
  return (process.env.TAIGA_BASE_URL || "https://taiga.500nuancesdegeek.fr").replace(/\/$/, "");
}

async function taigaFetch(path, options = {}) {
  const token = await authToken();
  const response = await fetch(`${taigaBaseUrl()}/api/v1${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? undefined : response.json();
}

async function taigaFetchOptional(path, options = {}) {
  try {
    return await taigaFetch(path, options);
  } catch (error) {
    return { error: error.message };
  }
}

let cachedToken;
async function authToken() {
  if (cachedToken) return cachedToken;
  if (process.env.TAIGA_AUTH_TOKEN) {
    cachedToken = process.env.TAIGA_AUTH_TOKEN;
    return cachedToken;
  }
  const username = requiredEnv("TAIGA_USERNAME");
  const password = requiredEnv("TAIGA_PASSWORD");
  const response = await fetch(`${taigaBaseUrl()}/api/v1/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "normal", username, password })
  });
  if (!response.ok) {
    throw new Error(`Taiga auth failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  cachedToken = body.auth_token;
  return cachedToken;
}

async function findBySubject(path, projectId, subject) {
  const items = await taigaFetch(`${path}?project=${projectId}`);
  return items.find((item) => item.subject === subject);
}

async function ensureEpic(projectId, subject) {
  const existing = await findBySubject("/epics", projectId, subject);
  if (existing) return existing;
  return taigaFetch("/epics", {
    method: "POST",
    body: JSON.stringify({ project: Number(projectId), subject })
  });
}

function epicMoveTag(epicSubject) {
  return `A_deplacer_${String(epicSubject)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function tagName(tag) {
  return Array.isArray(tag) ? tag[0] : tag;
}

async function ensureStoryTag(story, tag) {
  const existingTags = Array.isArray(story.tags) ? story.tags.map(tagName).filter(Boolean) : [];
  if (existingTags.includes(tag)) {
    return story;
  }

  const updated = await taigaFetchOptional(`/userstories/${story.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      version: story.version,
      tags: [...existingTags, tag]
    })
  });
  if (updated?.error) {
    console.warn(`warning: could not tag story ${story.subject}: ${updated.error}`);
    return story;
  }
  return updated;
}

async function ensureStory(projectId, story, epicBySubject) {
  const existing = await findBySubject("/userstories", projectId, story.subject);
  const moveTag = epicMoveTag(story.epic);
  if (existing) return ensureStoryTag(existing, moveTag);
  const created = await taigaFetch("/userstories", {
    method: "POST",
    body: JSON.stringify({
      project: Number(projectId),
      subject: story.subject,
      description: story.description,
      tags: [moveTag]
    })
  });
  const epic = epicBySubject.get(story.epic);
  if (epic?.id && created?.id) {
    const link = await taigaFetchOptional("/epic-userstories", {
      method: "POST",
      body: JSON.stringify({
        project: Number(projectId),
        epic: epic.id,
        user_story: created.id
      })
    });
    if (link?.error) {
      console.warn(`warning: could not link story to epic on this Taiga instance: ${story.subject}`);
    }
  }
  return created;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isInProgressStatus(status) {
  const name = normalizeName(status.name);
  return name === "en cours" || name === "in progress" || name === "doing" || name.includes("cours");
}

async function ensureSandboxStatus(project) {
  const projectId = project.id;
  const statuses = await taigaFetch(`/userstory-statuses?project=${projectId}`);
  const existing = statuses.find((status) => normalizeName(status.name) === "sandbox");
  if (existing) {
    return { project, status: existing, action: "exists" };
  }

  const after = statuses.find(isInProgressStatus) ?? statuses[0];
  const sorted = [...statuses].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const afterIndex = after ? sorted.findIndex((status) => status.id === after.id) : -1;
  const nextOrder = after ? Math.floor(Number(after.order ?? afterIndex + 1)) + 1 : 1;
  const created = await taigaFetch("/userstory-statuses", {
    method: "POST",
    body: JSON.stringify({
      project: Number(projectId),
      name: "Sandbox",
      color: "#8E44AD",
      order: nextOrder,
      is_closed: false
    })
  });

  return { project, status: created, action: "created", after };
}

async function ensureSandboxStatuses() {
  const discovered = await discoverProjects();
  const results = [];
  for (const project of discovered.projects) {
    try {
      results.push(await ensureSandboxStatus(project));
    } catch (error) {
      results.push({ project, action: "failed", error: error.message });
    }
  }
  return results;
}

function renamedProjectDescription() {
  return process.env.TAIGA_PROJECT_DESCRIPTION ||
    "Interface-moteur Android-first pour faire tourner des jeux de plateau live, semi-GN, murder parties, jeux de roles sociaux, jeux de cour et jeux d equipage coordonne, avec modules importables, gestes physiques, cartographie hybride et integration Mandragore en fin de roadmap.";
}

async function renameProject() {
  const projectId = await resolveProjectId();
  const current = await taigaFetch(`/projects/${projectId}`);
  const requestedSlug = process.env.TAIGA_PROJECT_NEW_SLUG || "ludovive";
  const renamed = await taigaFetch(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      version: current.version,
      name: process.env.TAIGA_PROJECT_NAME || "Ludovive",
      slug: requestedSlug,
      description: renamedProjectDescription()
    })
  });

  return {
    id: renamed.id,
    name: renamed.name,
    slug: renamed.slug,
    requestedSlug,
    slugChanged: renamed.slug === requestedSlug,
    is_private: renamed.is_private,
    description: renamed.description
  };
}

function audit() {
  console.log(JSON.stringify({
    baseUrl: taigaBaseUrl(),
    projectId: process.env.TAIGA_PROJECT_ID || null,
    projectSlug: process.env.TAIGA_PROJECT_SLUG || null,
    username: process.env.TAIGA_USERNAME || null,
    plan
  }, null, 2));
}

async function resolveProjectId() {
  if (process.env.TAIGA_PROJECT_ID) return process.env.TAIGA_PROJECT_ID;
  const slug = requiredEnv("TAIGA_PROJECT_SLUG");
  const username = process.env.TAIGA_USERNAME;
  const candidates = [
    slug,
    username ? `${username}-${slug}` : undefined,
    username ? `${username.toLowerCase()}-${slug}` : undefined
  ].filter(Boolean);

  let lastError;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const project = await taigaFetch(`/projects/by_slug?slug=${encodeURIComponent(candidate)}`);
      if (project?.id) {
        console.log(`resolved project: ${project.name} (${project.id}) via slug ${candidate}`);
        return String(project.id);
      }
    } catch (error) {
      lastError = error;
    }
  }
  const discovered = await discoverProjects();
  const normalizedSlug = slug.toLowerCase();
  const matchingProject = discovered.projects.find((project) => {
    const fields = [project.slug, project.name, project.description].filter(Boolean).map((value) => String(value).toLowerCase());
    return fields.some((value) => value.includes(normalizedSlug));
  });
  if (matchingProject?.id) {
    console.log(`resolved project: ${matchingProject.name} (${matchingProject.id}) via project list`);
    return String(matchingProject.id);
  }

  const available = discovered.projects.map((project) => `${project.id}: ${project.name} [${project.slug}]`).join("; ");
  throw new Error(`Could not resolve TAIGA_PROJECT_SLUG=${slug}. Available projects: ${available || "none"}. ${lastError?.message || ""}`.trim());
}

async function discoverProjects() {
  const username = requiredEnv("TAIGA_USERNAME");
  const users = await taigaFetchOptional(`/users?username=${encodeURIComponent(username)}`);
  const userList = Array.isArray(users) ? users : [];
  const user = userList.find((candidate) => candidate.username?.toLowerCase() === username.toLowerCase()) ?? userList[0];
  const queries = [
    user?.id ? `/projects?member=${user.id}` : undefined,
    "/projects?is_private=true",
    "/projects"
  ].filter(Boolean);

  const byId = new Map();
  const responses = [];
  for (const query of queries) {
    const result = await taigaFetchOptional(query);
    responses.push({ query, ok: Array.isArray(result), result });
    if (Array.isArray(result)) {
      for (const project of result) {
        if (project?.id) byId.set(project.id, project);
      }
    }
  }

  return {
    username,
    user: user ? { id: user.id, username: user.username, full_name: user.full_name } : null,
    projects: [...byId.values()].map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      is_private: project.is_private,
      description: project.description
    })),
    responses: responses.map((response) => ({
      query: response.query,
      ok: response.ok,
      error: response.ok ? undefined : response.result.error
    }))
  };
}

async function apply() {
  const projectId = await resolveProjectId();
  const epicBySubject = new Map();
  for (const epicSubject of plan.epics) {
    const epic = await ensureEpic(projectId, epicSubject);
    epicBySubject.set(epicSubject, epic);
    console.log(`epic: ${epicSubject}`);
  }
  for (const story of plan.stories) {
    await ensureStory(projectId, story, epicBySubject);
    console.log(`story: ${story.subject}`);
  }
}

if (command === "audit") {
  audit();
} else if (command === "discover") {
  discoverProjects().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error.message);
      process.exit(1);
    });
} else if (command === "sandbox-statuses") {
  ensureSandboxStatuses().then((results) => {
    for (const result of results) {
      if (result.action === "failed") {
        console.log(`failed: ${result.project.name} (${result.project.id}) - ${result.error}`);
      } else {
        const after = result.after ? ` after ${result.after.name}` : "";
        console.log(`${result.action}: ${result.project.name} (${result.project.id}) -> ${result.status.name}${after}`);
      }
    }
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else if (command === "rename-project") {
  renameProject().then((project) => {
    console.log(JSON.stringify(project, null, 2));
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else if (command === "apply") {
  apply().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  console.error("Usage: taiga-scrum-sync.js audit|discover|apply|rename-project|sandbox-statuses");
  process.exit(1);
}
