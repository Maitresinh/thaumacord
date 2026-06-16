import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";

export const app = Fastify({ logger: process.env.THAUMACORD_LOGGER === "true" });
await app.register(websocket);

const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  visibility: z.string().default("private"),
  min: z.number().optional(),
  max: z.number().optional()
});

const phaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  durationSeconds: z.number().int().positive().optional()
});

const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startingResources: z.record(z.number()).default({}),
  responsibilities: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  victoryCondition: z.unknown().optional()
});

const actionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phase: z.string().min(1),
  actor: z.string().min(1),
  target: z.string().min(1),
  cost: z.record(z.number()).optional(),
  effect: z.unknown(),
  gesture: z.string().optional(),
  fallback: z.string().optional(),
  requires: z.array(z.string()).optional()
});

const zoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fictionalType: z.string().optional(),
  presenceMethod: z.string().optional(),
  effects: z.array(z.unknown()).default([])
});

const moduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  pitch: z.string().optional(),
  inspirationNotes: z.string().optional(),
  players: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive()
  }),
  teamMode: z.unknown().optional(),
  resources: z.array(resourceSchema).default([]),
  phases: z.array(phaseSchema).min(1),
  roles: z.array(roleSchema).default([]),
  actions: z.array(actionSchema).default([]),
  zones: z.array(zoneSchema).default([]),
  victoryConditions: z.array(z.unknown()).optional()
});

type GameModule = z.infer<typeof moduleSchema>;
type Device = {
  id: string;
  name: string;
  participantId?: string;
  connected: boolean;
  lastSeenAt: string;
};

type Participant = {
  id: string;
  kind: "person" | "team" | "station" | "object" | "location" | "clock";
  name: string;
  roleId?: string;
  resources: Record<string, number>;
  statuses: Record<string, unknown>;
  locationId?: string;
};

type AuditEntry = {
  at: string;
  type: string;
  payload: unknown;
};

type Audience =
  | { kind: "dashboard" }
  | { kind: "device"; deviceId?: string };

type Session = {
  code: string;
  moduleId: string;
  phaseIndex: number;
  devices: Device[];
  participants: Participant[];
  audit: AuditEntry[];
};

const modules = new Map<string, GameModule>();
const sessions = new Map<string, Session>();
const liveClients = new Map<string, Set<{ audience: Audience; send: (payload: string) => void }>>();

export function resetRuntimeState(): void {
  sessions.clear();
  liveClients.clear();
}

const createSessionSchema = z.object({
  moduleId: z.string().min(1)
});

const joinSessionSchema = z.object({
  name: z.string().min(1).max(80)
});

const registerDeviceSchema = z.object({
  name: z.string().min(1).max(80)
});

const bindDeviceSchema = z.object({
  participantId: z.string().min(1)
});

const createParticipantSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["person", "team", "station", "object", "location", "clock"]).default("person"),
  roleId: z.string().min(1).optional()
});

const assignRoleSchema = z.object({
  roleId: z.string().min(1)
});

const setResourceSchema = z.object({
  resourceId: z.string().min(1),
  value: z.number().int()
});

const eventSchema = z.object({
  type: z.string().min(1),
  sourceDeviceId: z.string().min(1).optional(),
  participantId: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({})
});

function modulesDir(): string {
  return path.resolve(process.cwd(), "../../modules/examples");
}

async function loadModules(): Promise<void> {
  const moduleFiles = ["putsch-lite.json", "long-live-the-king-lite.json", "wolfpack-lite.json"];
  for (const file of moduleFiles) {
    const raw = await readFile(path.join(modulesDir(), file), "utf8");
    const parsed = moduleSchema.parse(JSON.parse(raw));
    modules.set(parsed.id, parsed);
  }
}

function makeCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getSession(code: string): Session | undefined {
  return sessions.get(code.toUpperCase());
}

function getModuleOrThrow(moduleId: string): GameModule {
  const module = modules.get(moduleId);
  if (!module) {
    throw new Error(`Unknown module: ${moduleId}`);
  }
  return module;
}

function currentPhase(session: Session): z.infer<typeof phaseSchema> {
  return getModuleOrThrow(session.moduleId).phases[session.phaseIndex];
}

function audit(session: Session, type: string, payload: unknown): void {
  session.audit.push({ at: new Date().toISOString(), type, payload });
}

function minimalReadModel(session: Session): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  return {
    code: session.code,
    readModel: "device.unbound",
    module: {
      id: module.id,
      name: module.name
    },
    phase: currentPhase(session),
    devices: session.devices.map((device) => ({
      id: device.id,
      name: device.name,
      bound: Boolean(device.participantId),
      connected: device.connected
    })),
    participants: session.participants.map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      name: participant.name,
      roleId: participant.roleId
    }))
  };
}

function readModelForAudience(session: Session, audience: Audience): Record<string, unknown> {
  if (audience.kind === "dashboard") {
    return dashboardReadModel(session);
  }

  const device = audience.deviceId ? session.devices.find((candidate) => candidate.id === audience.deviceId) : undefined;
  if (!device?.participantId) {
    return {
      ...minimalReadModel(session),
      deviceId: audience.deviceId
    };
  }

  const participantModel = participantReadModel(session, device.participantId);
  if (!participantModel) {
    return {
      ...minimalReadModel(session),
      deviceId: device.id
    };
  }

  return {
    readModel: "device.participant",
    deviceId: device.id,
    ...participantModel
  };
}

function livePayload(session: Session, type: string, audience: Audience, payload: unknown = {}): string {
  return JSON.stringify({
    type,
    payload,
    readModel: readModelForAudience(session, audience)
  });
}

function broadcast(session: Session, type: string, payload: unknown = {}): void {
  const clients = liveClients.get(session.code);
  if (!clients) {
    return;
  }

  for (const client of clients) {
    try {
      const message = livePayload(session, type, client.audience, payload);
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
}

function defaultResources(module: GameModule, roleId?: string): Record<string, number> {
  const resources = Object.fromEntries(module.resources.map((resource) => [resource.id, resource.min ?? 0]));
  const role = roleId ? module.roles.find((candidate) => candidate.id === roleId) : undefined;
  return { ...resources, ...(role?.startingResources ?? {}) };
}

function visibleSession(session: Session): Session & { module: GameModule; phase: z.infer<typeof phaseSchema> } {
  return {
    ...session,
    phase: currentPhase(session),
    module: getModuleOrThrow(session.moduleId)
  };
}

function dashboardReadModel(session: Session): ReturnType<typeof visibleSession> & { readModel: "dashboard" } {
  return {
    ...visibleSession(session),
    readModel: "dashboard"
  };
}

function participantReadModel(session: Session, participantId: string): Record<string, unknown> | undefined {
  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    return undefined;
  }

  const module = getModuleOrThrow(session.moduleId);
  return {
    code: session.code,
    module: {
      id: module.id,
      name: module.name
    },
    phase: currentPhase(session),
    participant,
    visibleParticipants: session.participants.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      name: candidate.name,
      roleId: candidate.roleId
    })),
    recentAudit: session.audit.slice(-20)
  };
}

function createParticipant(module: GameModule, input: z.infer<typeof createParticipantSchema>): Participant {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    name: input.name,
    roleId: input.roleId,
    resources: defaultResources(module, input.roleId),
    statuses: {}
  };
}

function renderIndex(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thaumacord Prototype</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #111315; color: #eee; }
    main { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 6px; font-size: 34px; }
    h2 { margin-top: 28px; color: #f1c76a; }
    section { border: 1px solid #33383f; border-radius: 8px; padding: 16px; margin: 16px 0; background: #181b1f; }
    label { display: block; margin: 10px 0 4px; color: #c8ccd1; }
    input, select, button { font: inherit; border-radius: 6px; border: 1px solid #464d56; padding: 10px; }
    input, select { width: 100%; box-sizing: border-box; background: #0d0f11; color: #eee; }
    button { background: #7c2f2f; color: white; cursor: pointer; margin-top: 12px; }
    button.secondary { background: #2e4257; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    pre { white-space: pre-wrap; background: #0d0f11; padding: 12px; border-radius: 6px; overflow: auto; }
    .muted { color: #9da5ad; }
    .pill { display: inline-block; padding: 4px 8px; border: 1px solid #555; border-radius: 999px; margin: 2px; }
  </style>
</head>
<body>
  <main>
    <h1>Thaumacord</h1>
    <p class="muted">Prototype de transmission : modules, sessions, appareils, participants, evenements, etat synchronise.</p>
    <div class="grid">
      <section>
        <h2>1. Creer une partie</h2>
        <label for="module">Module</label>
        <select id="module"></select>
        <button id="create">Creer la session</button>
      </section>
      <section>
        <h2>2. Connecter un appareil</h2>
        <label for="code">Code session</label>
        <input id="code" placeholder="ABC123" />
        <label for="deviceName">Nom appareil</label>
        <input id="deviceName" placeholder="Telephone Phil" />
        <button id="join">Enregistrer appareil + participant</button>
      </section>
      <section>
        <h2>3. Piloter</h2>
        <button id="advance" class="secondary">Phase suivante</button>
        <button id="refresh" class="secondary">Rafraichir</button>
      </section>
    </div>
    <section>
      <h2>Etat</h2>
      <div id="summary"></div>
      <pre id="state">Aucune session chargee.</pre>
    </section>
    <section>
      <h2>Live</h2>
      <pre id="live">Aucun flux connecte.</pre>
    </section>
  </main>
  <script>
    let sessionCode = "";
    let liveSocket;
    function connectLive(code) {
      if (liveSocket) liveSocket.close();
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      liveSocket = new WebSocket(protocol + "://" + location.host + "/sessions/" + code + "/live?dashboard=true");
      liveSocket.addEventListener("open", () => {
        document.querySelector("#live").textContent = "Flux connecte pour " + code;
      });
      liveSocket.addEventListener("message", async (event) => {
        const data = JSON.parse(event.data);
        document.querySelector("#live").textContent = JSON.stringify(data, null, 2);
        if (data.readModel) {
          document.querySelector("#state").textContent = JSON.stringify(data.readModel, null, 2);
        }
      });
      liveSocket.addEventListener("close", () => {
        document.querySelector("#live").textContent += "\\nFlux ferme.";
      });
    }
    async function api(url, options) {
      const res = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    async function loadModules() {
      const list = await api("/modules");
      document.querySelector("#module").innerHTML = list.map((m) => '<option value="' + m.id + '">' + m.name + '</option>').join("");
    }
    async function refresh() {
      const code = document.querySelector("#code").value || sessionCode;
      if (!code) return;
      const session = await api("/sessions/" + code);
      sessionCode = session.code;
      document.querySelector("#code").value = session.code;
      document.querySelector("#summary").innerHTML = [
        '<span class="pill">Code ' + session.code + '</span>',
        '<span class="pill">' + session.module.name + '</span>',
        '<span class="pill">Phase ' + session.phase.name + '</span>',
        '<span class="pill">' + session.devices.length + ' appareil(s)</span>',
        '<span class="pill">' + session.participants.length + ' participant(s)</span>'
      ].join(" ");
      document.querySelector("#state").textContent = JSON.stringify(session, null, 2);
    }
    document.querySelector("#create").addEventListener("click", async () => {
      const moduleId = document.querySelector("#module").value;
      const session = await api("/sessions", { method: "POST", body: JSON.stringify({ moduleId }) });
      sessionCode = session.code;
      document.querySelector("#code").value = session.code;
      connectLive(session.code);
      await refresh();
    });
    document.querySelector("#join").addEventListener("click", async () => {
      const code = document.querySelector("#code").value;
      const name = document.querySelector("#deviceName").value;
      await api("/sessions/" + code + "/join", { method: "POST", body: JSON.stringify({ name }) });
      document.querySelector("#deviceName").value = "";
      await refresh();
    });
    document.querySelector("#advance").addEventListener("click", async () => {
      const code = document.querySelector("#code").value || sessionCode;
      await api("/sessions/" + code + "/phases/advance", { method: "POST", body: JSON.stringify({}) });
      await refresh();
    });
    document.querySelector("#refresh").addEventListener("click", refresh);
    loadModules();
  </script>
</body>
</html>`;
}

await loadModules();

app.get("/", async (_request, reply) => reply.type("text/html").send(renderIndex()));
app.get("/health", async () => ({ ok: true, service: "thaumacord-server" }));

app.get("/sessions/:code/live", { websocket: true }, (connection, request) => {
  const { code } = request.params as { code: string };
  const query = request.query as { deviceId?: string; dashboard?: string };
  const session = getSession(code);
  if (!session) {
    connection.close();
    return;
  }

  const audience: Audience = query.dashboard === "true" ? { kind: "dashboard" } : { kind: "device", deviceId: query.deviceId };
  const client = {
    audience,
    send: (payload: string) => connection.send(payload)
  };
  const clients = liveClients.get(session.code) ?? new Set<{ audience: Audience; send: (payload: string) => void }>();
  clients.add(client);
  liveClients.set(session.code, clients);

  client.send(livePayload(session, "live.connected", audience, { code: session.code }));

  connection.on("message", (message: Buffer) => {
    audit(session, "live.message", { raw: message.toString() });
    broadcast(session, "audit.appended", session.audit.at(-1));
  });

  connection.on("close", () => {
    clients.delete(client);
  });
});

app.get("/modules", async () =>
  [...modules.values()].map((module) => ({
    id: module.id,
    name: module.name,
    version: module.version,
    players: module.players,
    phases: module.phases.length,
    roles: module.roles.length,
    actions: module.actions.length,
    zones: module.zones.length
  }))
);

app.get("/modules/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const module = modules.get(id);
  if (!module) {
    return reply.code(404).send({ error: "Module not found" });
  }
  return module;
});

app.post("/sessions", async (request, reply) => {
  const input = createSessionSchema.parse(request.body);
  const module = modules.get(input.moduleId);
  if (!module) {
    return reply.code(400).send({ error: "Unknown module" });
  }

  const code = makeCode();
  const session: Session = {
    code,
    moduleId: module.id,
    phaseIndex: 0,
    devices: [],
    participants: [],
    audit: []
  };

  audit(session, "session.created", { moduleId: module.id, phaseId: module.phases[0].id });
  sessions.set(code, session);
  return reply.code(201).send(visibleSession(session));
});

app.get("/sessions/:code", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  return visibleSession(session);
});

app.post("/sessions/:code/join", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const module = getModuleOrThrow(session.moduleId);
  if (session.participants.filter((participant) => participant.kind === "person").length >= module.players.max) {
    return reply.code(409).send({ error: "Session is full" });
  }

  const input = joinSessionSchema.parse(request.body);
  const participant = createParticipant(module, { name: input.name, kind: "person" });
  const device: Device = {
    id: crypto.randomUUID(),
    name: input.name,
    participantId: participant.id,
    connected: true,
    lastSeenAt: new Date().toISOString()
  };

  session.participants.push(participant);
  session.devices.push(device);
  audit(session, "device.registered", { deviceId: device.id, name: device.name });
  audit(session, "participant.joined", { participantId: participant.id, name: participant.name });
  audit(session, "participant.bound_to_device", { participantId: participant.id, deviceId: device.id });
  return reply.code(201).send({ device, participant, sessionCode: session.code });
});

app.post("/sessions/:code/devices", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = registerDeviceSchema.parse(request.body);
  const device: Device = {
    id: crypto.randomUUID(),
    name: input.name,
    connected: true,
    lastSeenAt: new Date().toISOString()
  };

  session.devices.push(device);
  audit(session, "device.registered", { deviceId: device.id, name: device.name });
  broadcast(session, "device.registered", { deviceId: device.id });
  return reply.code(201).send({ device, sessionCode: session.code });
});

app.post("/sessions/:code/devices/:deviceId/bind", async (request, reply) => {
  const { code, deviceId } = request.params as { code: string; deviceId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = bindDeviceSchema.parse(request.body);
  const device = session.devices.find((candidate) => candidate.id === deviceId);
  const participant = session.participants.find((candidate) => candidate.id === input.participantId);
  if (!device) {
    return reply.code(404).send({ error: "Device not found" });
  }
  if (!participant) {
    return reply.code(404).send({ error: "Participant not found" });
  }

  device.participantId = participant.id;
  device.lastSeenAt = new Date().toISOString();
  audit(session, "participant.bound_to_device", { participantId: participant.id, deviceId: device.id });
  broadcast(session, "participant.bound_to_device", { participantId: participant.id, deviceId: device.id });
  return dashboardReadModel(session);
});

app.post("/sessions/:code/participants", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const module = getModuleOrThrow(session.moduleId);
  const input = createParticipantSchema.parse(request.body);
  const participant = createParticipant(module, input);
  session.participants.push(participant);
  audit(session, "participant.created", { participantId: participant.id, kind: participant.kind, name: participant.name });
  broadcast(session, "participant.created", { participantId: participant.id });
  return reply.code(201).send({ participant, sessionCode: session.code });
});

app.get("/sessions/:code/read-models/dashboard", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  return dashboardReadModel(session);
});

app.get("/sessions/:code/read-models/participant/:participantId", async (request, reply) => {
  const { code, participantId } = request.params as { code: string; participantId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const readModel = participantReadModel(session, participantId);
  if (!readModel) {
    return reply.code(404).send({ error: "Participant not found" });
  }
  return readModel;
});

app.get("/sessions/:code/read-models/device/:deviceId", async (request, reply) => {
  const { code, deviceId } = request.params as { code: string; deviceId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  if (!session.devices.some((device) => device.id === deviceId)) {
    return reply.code(404).send({ error: "Device not found" });
  }
  return readModelForAudience(session, { kind: "device", deviceId });
});

app.post("/sessions/:code/events", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const event = eventSchema.parse(request.body);
  if (event.sourceDeviceId && !session.devices.some((device) => device.id === event.sourceDeviceId)) {
    return reply.code(400).send({ error: "Unknown source device" });
  }
  if (event.participantId && !session.participants.some((participant) => participant.id === event.participantId)) {
    return reply.code(400).send({ error: "Unknown participant" });
  }

  audit(session, event.type, {
    sourceDeviceId: event.sourceDeviceId,
    participantId: event.participantId,
    payload: event.payload
  });
  broadcast(session, "event.accepted", session.audit.at(-1));

  return reply.code(202).send({
    accepted: true,
    audit: session.audit.at(-1),
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/phases/advance", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const module = getModuleOrThrow(session.moduleId);
  session.phaseIndex = (session.phaseIndex + 1) % module.phases.length;
  audit(session, "phase.changed", { phaseId: currentPhase(session).id, phaseIndex: session.phaseIndex });
  broadcast(session, "phase.changed", { phaseId: currentPhase(session).id, phaseIndex: session.phaseIndex });
  return visibleSession(session);
});

app.post("/sessions/:code/players/:playerId/role", async (request, reply) => {
  const { code, playerId } = request.params as { code: string; playerId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const module = getModuleOrThrow(session.moduleId);
  const participant = session.participants.find((candidate) => candidate.id === playerId);
  if (!participant) {
    return reply.code(404).send({ error: "Participant not found" });
  }

  const input = assignRoleSchema.parse(request.body);
  const role = module.roles.find((candidate) => candidate.id === input.roleId);
  if (!role) {
    return reply.code(400).send({ error: "Unknown role" });
  }

  participant.roleId = role.id;
  participant.resources = defaultResources(module, role.id);
  audit(session, "role.assigned", { participantId: participant.id, roleId: role.id });
  broadcast(session, "role.assigned", { participantId: participant.id, roleId: role.id });
  return visibleSession(session);
});

app.post("/sessions/:code/players/:playerId/resources", async (request, reply) => {
  const { code, playerId } = request.params as { code: string; playerId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const module = getModuleOrThrow(session.moduleId);
  const participant = session.participants.find((candidate) => candidate.id === playerId);
  if (!participant) {
    return reply.code(404).send({ error: "Participant not found" });
  }

  const input = setResourceSchema.parse(request.body);
  const resource = module.resources.find((candidate) => candidate.id === input.resourceId);
  if (!resource) {
    return reply.code(400).send({ error: "Unknown resource" });
  }

  const min = resource.min ?? Number.NEGATIVE_INFINITY;
  const max = resource.max ?? Number.POSITIVE_INFINITY;
  if (input.value < min || input.value > max) {
    return reply.code(400).send({ error: `Resource value must be between ${min} and ${max}` });
  }

  participant.resources[input.resourceId] = input.value;
  audit(session, "resource.changed", { participantId: participant.id, resourceId: input.resourceId, value: input.value });
  broadcast(session, "resource.changed", { participantId: participant.id, resourceId: input.resourceId, value: input.value });
  return visibleSession(session);
});

const isEntrypoint = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isEntrypoint) {
  await app.listen({ port: Number(process.env.PORT ?? 3333), host: "0.0.0.0" });
}
