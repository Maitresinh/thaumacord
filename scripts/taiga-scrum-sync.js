#!/usr/bin/env node

const command = process.argv[2] || "audit";

const plan = {
  projectName: "Thaumacord",
  sprintName: process.env.TAIGA_SPRINT_NAME || "Thaumacord MVP Putsch",
  epics: [
    "Transmission Core",
    "Module Import",
    "Participant State Model",
    "Dashboard Read Model",
    "Action and Rule Events",
    "Operational Putsch MVP",
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

async function ensureStory(projectId, story, epicBySubject) {
  const existing = await findBySubject("/userstories", projectId, story.subject);
  if (existing) return existing;
  const created = await taigaFetch("/userstories", {
    method: "POST",
    body: JSON.stringify({
      project: Number(projectId),
      subject: story.subject,
      description: story.description
    })
  });
  const epic = epicBySubject.get(story.epic);
  if (epic?.id && created?.id) {
    await taigaFetch("/epic-userstories", {
      method: "POST",
      body: JSON.stringify({
        project: Number(projectId),
        epic: epic.id,
        user_story: created.id
      })
    });
  }
  return created;
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
} else if (command === "apply") {
  apply().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  console.error("Usage: taiga-scrum-sync.js audit|discover|apply");
  process.exit(1);
}
