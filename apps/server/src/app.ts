import { readFile } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";

export const app = Fastify({ logger: process.env.THAUMACORD_LOGGER === "true" });
await app.register(websocket);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: "Validation failed",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  return reply.code(500).send({ error: "Internal server error" });
});

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
  mechanicId: z.string().min(1).optional(),
  gesture: z.string().optional(),
  fallback: z.string().optional(),
  requires: z.array(z.string()).optional()
});

const mechanicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.string().min(1),
  summary: z.string().optional(),
  phases: z.array(z.string()).optional(),
  inputs: z.array(z.unknown()).default([]),
  resolution: z.unknown().optional(),
  visibility: z.unknown().optional(),
  variants: z.array(z.unknown()).default([])
});

const componentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  count: z.number().int().nonnegative().optional(),
  visibility: z.string().default("private"),
  tags: z.array(z.string()).default([]),
  fields: z.record(z.unknown()).optional()
});

const setupDistributionSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  target: z.enum(["allParticipants", "role"]),
  roleId: z.string().min(1).optional(),
  count: z.number().int().positive(),
  visibility: z.string().default("private")
});

const setupSchema = z.object({
  phaseId: z.string().min(1).optional(),
  instructions: z.array(z.string()).default([]),
  distributions: z.array(setupDistributionSchema).default([])
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
  timeline: z.unknown().optional(),
  players: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive()
  }),
  teamMode: z.unknown().optional(),
  resources: z.array(resourceSchema).default([]),
  phases: z.array(phaseSchema).min(1),
  roles: z.array(roleSchema).default([]),
  components: z.array(componentSchema).default([]),
  setup: setupSchema.optional(),
  mechanics: z.array(mechanicSchema).default([]),
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
  inventory: Record<string, number>;
  statuses: Record<string, unknown>;
  locationId?: string;
};

type AuditEntry = {
  id: string;
  sequence: number;
  at: string;
  type: string;
  payload: unknown;
};

type PendingResolution = {
  id: string;
  type: string;
  participantId?: string;
  zoneId?: string;
  resourceId?: string;
  actionId?: string;
  mechanicId?: string;
  mechanicFamily?: string;
  payload?: Record<string, unknown>;
  resolution?: unknown;
  visibility?: unknown;
  status: "pending";
  createdAt: string;
};

type PhaseClock = {
  turn: number;
  phaseId: string;
  phaseIndex: number;
  phaseStartedAt: string;
  phaseDurationSeconds?: number;
  phaseEndsAt?: string;
  facilitatorControlled: boolean;
};

type Exchange = {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  resources: Record<string, number>;
  status: "completed";
  createdAt: string;
};

type ComponentPool = {
  componentId: string;
  remaining: number;
  exhausted: boolean;
};

type SessionMessage = {
  id: string;
  target: "allParticipants" | "participant" | "dashboard";
  participantId?: string;
  text: string;
  channel: string;
  status: "sent";
  createdAt: string;
};

type Audience =
  | { kind: "dashboard" }
  | { kind: "device"; deviceId?: string };

type Session = {
  code: string;
  moduleId: string;
  phaseIndex: number;
  phaseClock: PhaseClock;
  devices: Device[];
  participants: Participant[];
  unlockedPhases: string[];
  risks: Record<string, number>;
  componentPools: Record<string, ComponentPool>;
  pendingResolutions: PendingResolution[];
  exchanges: Exchange[];
  messages: SessionMessage[];
  nextAuditSequence: number;
  audit: AuditEntry[];
};

type ActionAvailability = {
  id: string;
  name: string;
  phase: string;
  gesture?: string;
  fallback?: string;
  mechanicId?: string;
  available: boolean;
  blockedBy: string[];
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
  name: z.string().min(1).max(80),
  roleId: z.string().min(1).optional()
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

const phaseTimerSchema = z.object({
  durationSeconds: z.number().int().positive().optional(),
  endsAt: z.string().datetime().optional(),
  facilitatorControlled: z.boolean().default(true)
}).refine((value) => value.durationSeconds !== undefined || value.endsAt !== undefined, {
  message: "durationSeconds or endsAt is required"
});

const auditQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const zonePresenceSchema = z.object({
  participantId: z.string().min(1).optional(),
  sourceDeviceId: z.string().min(1).optional()
});

const exchangeSchema = z.object({
  fromParticipantId: z.string().min(1).optional(),
  sourceDeviceId: z.string().min(1).optional(),
  toParticipantId: z.string().min(1),
  resources: z.record(z.number().int().positive())
});

const drawComponentSchema = z.object({
  participantId: z.string().min(1).optional(),
  sourceDeviceId: z.string().min(1).optional(),
  componentId: z.string().min(1),
  count: z.number().int().positive(),
  reason: z.string().min(1).optional()
});

const sessionMessageSchema = z.object({
  target: z.enum(["allParticipants", "participant", "dashboard"]),
  participantId: z.string().min(1).optional(),
  text: z.string().min(1).max(2000),
  channel: z.string().min(1).default("facilitator")
});

const resolveResolutionSchema = z.object({
  outcome: z.string().min(1).default("facilitator-resolved"),
  note: z.string().max(2000).optional(),
  payload: z.record(z.unknown()).default({})
});

const eventSchema = z.object({
  type: z.string().min(1),
  actionId: z.string().min(1).optional(),
  gesture: z.string().min(1).optional(),
  sourceDeviceId: z.string().min(1).optional(),
  participantId: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({})
});

const resourceDeltaEffectSchema = z.object({
  type: z.literal("adjustResource"),
  resource: z.string().min(1),
  delta: z.number().int()
});

const setStateEffectSchema = z.object({
  type: z.literal("setState"),
  state: z.string().min(1),
  value: z.unknown().optional()
});

const messageEffectSchema = z.object({
  type: z.literal("message"),
  visibility: z.string().optional()
});

const revealContactHintEffectSchema = z.object({
  type: z.literal("revealContactHint"),
  precision: z.string().min(1)
});

const unlockPhaseZoneEffectSchema = z.object({
  type: z.literal("unlockPhase"),
  phase: z.string().min(1)
});

const increaseRiskZoneEffectSchema = z.object({
  type: z.literal("increaseRisk"),
  risk: z.string().min(1),
  amount: z.number().int()
});

const periodicDamageCheckZoneEffectSchema = z.object({
  type: z.literal("periodicDamageCheck"),
  resource: z.string().min(1)
});

const knownEffectSchema = z.discriminatedUnion("type", [
  resourceDeltaEffectSchema,
  setStateEffectSchema,
  messageEffectSchema,
  revealContactHintEffectSchema
]);

const knownZoneEffectSchema = z.discriminatedUnion("type", [
  unlockPhaseZoneEffectSchema,
  increaseRiskZoneEffectSchema,
  periodicDamageCheckZoneEffectSchema
]);

type KnownEffect = z.infer<typeof knownEffectSchema>;
type KnownZoneEffect = z.infer<typeof knownZoneEffectSchema>;
type EventInput = z.infer<typeof eventSchema>;

function modulesDir(): string {
  return path.resolve(process.cwd(), "../../modules/examples");
}

function validateModuleReferences(module: GameModule): void {
  const componentIds = new Set(module.components.map((component) => component.id));
  for (const distribution of module.setup?.distributions ?? []) {
    if (!componentIds.has(distribution.componentId)) {
      throw new Error(`Module ${module.id} setup distribution references unknown component: ${distribution.componentId}`);
    }
    if (distribution.target === "role" && !module.roles.some((role) => role.id === distribution.roleId)) {
      throw new Error(`Module ${module.id} setup distribution references unknown role: ${distribution.roleId}`);
    }
  }
}

async function loadModules(): Promise<void> {
  const moduleFiles = ["putsch-lite.json", "long-live-the-king-lite.json", "wolfpack-lite.json"];
  for (const file of moduleFiles) {
    const raw = await readFile(path.join(modulesDir(), file), "utf8");
    const parsed = moduleSchema.parse(JSON.parse(raw));
    validateModuleReferences(parsed);
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

function phaseClock(module: GameModule, phaseIndex: number, turn: number, facilitatorControlled = false, durationSeconds?: number): PhaseClock {
  const phase = module.phases[phaseIndex];
  const startedAt = new Date();
  const activeDurationSeconds = durationSeconds ?? phase.durationSeconds;
  return {
    turn,
    phaseId: phase.id,
    phaseIndex,
    phaseStartedAt: startedAt.toISOString(),
    phaseDurationSeconds: activeDurationSeconds,
    phaseEndsAt: activeDurationSeconds ? new Date(startedAt.getTime() + activeDurationSeconds * 1000).toISOString() : undefined,
    facilitatorControlled
  };
}

function setPhaseTimer(session: Session, input: z.infer<typeof phaseTimerSchema>): PhaseClock {
  const now = new Date();
  const durationSeconds = input.durationSeconds ?? Math.max(1, Math.ceil((new Date(input.endsAt!).getTime() - now.getTime()) / 1000));
  session.phaseClock = {
    turn: session.phaseClock.turn,
    phaseId: currentPhase(session).id,
    phaseIndex: session.phaseIndex,
    phaseStartedAt: now.toISOString(),
    phaseDurationSeconds: durationSeconds,
    phaseEndsAt: input.endsAt ?? new Date(now.getTime() + durationSeconds * 1000).toISOString(),
    facilitatorControlled: input.facilitatorControlled
  };
  return session.phaseClock;
}

function audit(session: Session, type: string, payload: unknown): void {
  const sequence = session.nextAuditSequence;
  session.nextAuditSequence += 1;
  session.audit.push({
    id: `${session.code}-${sequence}`,
    sequence,
    at: new Date().toISOString(),
    type,
    payload
  });
}

function auditCatchUp(session: Session, after: number, limit: number): Record<string, unknown> {
  const entries = session.audit.filter((entry) => entry.sequence > after).slice(0, limit);
  const latestSequence = session.nextAuditSequence - 1;
  return {
    code: session.code,
    after,
    limit,
    latestSequence,
    hasMore: entries.at(-1)?.sequence !== undefined && entries.at(-1)!.sequence < latestSequence,
    entries
  };
}

function getDevice(session: Session, deviceId?: string): Device | undefined {
  return deviceId ? session.devices.find((device) => device.id === deviceId) : undefined;
}

function inferParticipantId(session: Session, participantId?: string, sourceDeviceId?: string): string | undefined {
  if (participantId) {
    return participantId;
  }
  return getDevice(session, sourceDeviceId)?.participantId;
}

function participantExists(session: Session, participantId?: string): boolean {
  return Boolean(participantId && session.participants.some((participant) => participant.id === participantId));
}

function markDeviceConnection(session: Session, device: Device, connected: boolean): Record<string, unknown> {
  const wasConnected = device.connected;
  device.connected = connected;
  device.lastSeenAt = new Date().toISOString();
  const payload = {
    deviceId: device.id,
    connected: device.connected,
    wasConnected,
    lastSeenAt: device.lastSeenAt
  };
  audit(session, connected ? "device.heartbeat" : "device.disconnected", payload);
  broadcast(session, connected ? "device.heartbeat" : "device.disconnected", session.audit.at(-1));
  return payload;
}

function withInferredParticipant(session: Session, event: EventInput): EventInput {
  return {
    ...event,
    participantId: inferParticipantId(session, event.participantId, event.sourceDeviceId)
  };
}

function resourceBounds(module: GameModule, resourceId: string): { min: number; max: number } | undefined {
  const resource = module.resources.find((candidate) => candidate.id === resourceId);
  if (!resource) {
    return undefined;
  }
  return {
    min: resource.min ?? Number.NEGATIVE_INFINITY,
    max: resource.max ?? Number.POSITIVE_INFINITY
  };
}

function assertResourceChange(module: GameModule, participant: Participant, resourceId: string, delta: number): void {
  const bounds = resourceBounds(module, resourceId);
  if (!bounds) {
    throw new Error(`Unknown resource: ${resourceId}`);
  }

  const current = participant.resources[resourceId] ?? bounds.min;
  const next = current + delta;
  if (next < bounds.min || next > bounds.max) {
    throw new Error(`Resource ${resourceId} would be outside bounds`);
  }
}

function adjustResource(module: GameModule, participant: Participant, resourceId: string, delta: number): { resourceId: string; before: number; after: number } {
  assertResourceChange(module, participant, resourceId, delta);
  const bounds = resourceBounds(module, resourceId);
  if (!bounds) {
    throw new Error(`Unknown resource: ${resourceId}`);
  }
  const before = participant.resources[resourceId] ?? bounds.min;
  const after = before + delta;
  participant.resources[resourceId] = after;
  return { resourceId, before, after };
}

function drawComponents(session: Session, componentId: string, count: number): { componentId: string; before: number; after: number; count: number } {
  const pool = session.componentPools[componentId];
  if (!pool) {
    throw new Error(`Unknown component pool: ${componentId}`);
  }

  const before = pool.remaining;
  if (before < count) {
    throw new Error(`Component ${componentId} pool has only ${before} remaining`);
  }

  pool.remaining -= count;
  pool.exhausted = pool.remaining === 0;
  return {
    componentId,
    before,
    after: pool.remaining,
    count
  };
}

function createExchange(session: Session, fromParticipantId: string, toParticipantId: string, resources: Record<string, number>): Record<string, unknown> {
  if (fromParticipantId === toParticipantId) {
    throw new Error("Exchange requires two different participants");
  }

  const module = getModuleOrThrow(session.moduleId);
  const fromParticipant = session.participants.find((participant) => participant.id === fromParticipantId);
  const toParticipant = session.participants.find((participant) => participant.id === toParticipantId);
  if (!fromParticipant) {
    throw new Error("Unknown source participant");
  }
  if (!toParticipant) {
    throw new Error("Unknown target participant");
  }

  for (const [resourceId, amount] of Object.entries(resources)) {
    if (!resourceBounds(module, resourceId)) {
      throw new Error(`Unknown resource: ${resourceId}`);
    }
    assertResourceChange(module, fromParticipant, resourceId, -amount);
    assertResourceChange(module, toParticipant, resourceId, amount);
  }

  const transfers = Object.entries(resources).map(([resourceId, amount]) => ({
    resourceId,
    amount,
    from: adjustResource(module, fromParticipant, resourceId, -amount),
    to: adjustResource(module, toParticipant, resourceId, amount)
  }));

  const exchange: Exchange = {
    id: crypto.randomUUID(),
    fromParticipantId,
    toParticipantId,
    resources,
    status: "completed",
    createdAt: new Date().toISOString()
  };
  session.exchanges.push(exchange);

  return {
    exchange,
    transfers
  };
}

function visibleMessagesForParticipant(session: Session, participantId: string): SessionMessage[] {
  return session.messages.filter((message) => message.target === "allParticipants" || message.participantId === participantId);
}

function createSessionMessage(session: Session, input: z.infer<typeof sessionMessageSchema>): SessionMessage {
  if (input.target === "participant" && !input.participantId) {
    throw new Error("participantId is required for participant messages");
  }
  if (input.participantId && !participantExists(session, input.participantId)) {
    throw new Error("Unknown participant");
  }

  const message: SessionMessage = {
    id: crypto.randomUUID(),
    target: input.target,
    participantId: input.participantId,
    text: input.text,
    channel: input.channel,
    status: "sent",
    createdAt: new Date().toISOString()
  };
  session.messages.push(message);
  return message;
}

function resolvePendingResolution(session: Session, resolutionId: string, input: z.infer<typeof resolveResolutionSchema>): Record<string, unknown> {
  const index = session.pendingResolutions.findIndex((resolution) => resolution.id === resolutionId);
  if (index === -1) {
    throw new Error("Resolution not found");
  }

  const [resolution] = session.pendingResolutions.splice(index, 1);
  return {
    resolutionId,
    resolution,
    outcome: input.outcome,
    note: input.note,
    payload: input.payload,
    resolvedAt: new Date().toISOString()
  };
}

function runSetupDistribution(session: Session): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  const setup = module.setup;
  if (!setup) {
    return { applied: false, reason: "No setup declared", distributions: [] };
  }

  const appliedDistributions = setup.distributions.map((distribution) => {
    const component = module.components.find((candidate) => candidate.id === distribution.componentId);
    if (!component) {
      throw new Error(`Unknown component: ${distribution.componentId}`);
    }

    const targets = session.participants.filter((participant) => {
      if (distribution.target === "allParticipants") {
        return true;
      }
      return participant.roleId === distribution.roleId;
    });

    const draw = drawComponents(session, component.id, targets.length * distribution.count);
    for (const participant of targets) {
      participant.inventory[component.id] = (participant.inventory[component.id] ?? 0) + distribution.count;
    }

    return {
      id: distribution.id,
      componentId: component.id,
      count: distribution.count,
      target: distribution.target,
      roleId: distribution.roleId,
      participantIds: targets.map((participant) => participant.id),
      draw,
      visibility: distribution.visibility
    };
  });

  return {
    applied: true,
    phaseId: setup.phaseId,
    distributions: appliedDistributions
  };
}

function drawComponentsToParticipant(session: Session, participantId: string, componentId: string, count: number): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  if (!module.components.some((component) => component.id === componentId)) {
    throw new Error(`Unknown component: ${componentId}`);
  }

  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    throw new Error("Unknown participant");
  }

  const draw = drawComponents(session, componentId, count);
  const before = participant.inventory[componentId] ?? 0;
  const after = before + count;
  participant.inventory[componentId] = after;

  return {
    participantId,
    componentId,
    count,
    draw,
    inventory: {
      before,
      after
    }
  };
}

function applyEffect(module: GameModule, participant: Participant, effect: KnownEffect, event: EventInput): Record<string, unknown> {
  if (effect.type === "adjustResource") {
    return {
      type: effect.type,
      ...adjustResource(module, participant, effect.resource, effect.delta)
    };
  }

  if (effect.type === "setState") {
    const value = effect.value ?? event.payload.value ?? true;
    const before = participant.statuses[effect.state];
    participant.statuses[effect.state] = value;
    return { type: effect.type, state: effect.state, before, after: value };
  }

  if (effect.type === "message") {
    participant.statuses.lastMessage = {
      visibility: effect.visibility ?? "private",
      text: typeof event.payload.text === "string" ? event.payload.text : ""
    };
    return { type: effect.type, visibility: effect.visibility ?? "private" };
  }

  participant.statuses.contactHint = {
    precision: effect.precision,
    hint: typeof event.payload.hint === "string" ? event.payload.hint : undefined
  };
  return { type: effect.type, precision: effect.precision };
}

function effectType(effect: unknown, fallback: string): string {
  return typeof effect === "object" && effect !== null && "type" in effect && typeof effect.type === "string" ? effect.type : fallback;
}

function opensPendingResolution(mechanic: GameModule["mechanics"][number]): boolean {
  return ["petition", "vote", "contest", "facilitator-action", "triggered-ability", "information-action", "card-or-object"].includes(mechanic.family);
}

function createPendingActionResolution(
  session: Session,
  module: GameModule,
  participant: Participant,
  action: GameModule["actions"][number],
  event: EventInput
): Record<string, unknown> | undefined {
  if (!action.mechanicId) {
    return undefined;
  }

  const mechanic = module.mechanics.find((candidate) => candidate.id === action.mechanicId);
  if (!mechanic || !opensPendingResolution(mechanic)) {
    return undefined;
  }

  const pendingResolution: PendingResolution = {
    id: crypto.randomUUID(),
    type: effectType(action.effect, mechanic.family),
    participantId: participant.id,
    actionId: action.id,
    mechanicId: mechanic.id,
    mechanicFamily: mechanic.family,
    payload: event.payload,
    resolution: mechanic.resolution,
    visibility: mechanic.visibility,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  session.pendingResolutions.push(pendingResolution);

  return {
    type: "pendingResolution",
    resolutionId: pendingResolution.id,
    mechanicId: mechanic.id,
    mechanicFamily: mechanic.family,
    actionEffectType: pendingResolution.type,
    status: pendingResolution.status
  };
}

function applyZoneEffect(session: Session, participant: Participant, zoneId: string, effect: KnownZoneEffect): Record<string, unknown> {
  if (effect.type === "unlockPhase") {
    if (!session.unlockedPhases.includes(effect.phase)) {
      session.unlockedPhases.push(effect.phase);
    }
    return { type: effect.type, phase: effect.phase };
  }

  if (effect.type === "increaseRisk") {
    const before = session.risks[effect.risk] ?? 0;
    const after = before + effect.amount;
    session.risks[effect.risk] = after;
    return { type: effect.type, risk: effect.risk, before, after };
  }

  const pendingResolution: PendingResolution = {
    id: crypto.randomUUID(),
    type: effect.type,
    participantId: participant.id,
    zoneId,
    resourceId: effect.resource,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  session.pendingResolutions.push(pendingResolution);
  return { type: effect.type, resource: effect.resource, pending: true, resolutionId: pendingResolution.id };
}

function enterZone(session: Session, participantId: string, zoneId: string): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    throw new Error("Unknown participant");
  }

  const zone = module.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) {
    throw new Error(`Unknown zone: ${zoneId}`);
  }

  const previousLocationId = participant.locationId;
  participant.locationId = zone.id;
  const effects = zone.effects.map((effect) => {
    const parsedEffect = knownZoneEffectSchema.safeParse(effect);
    return parsedEffect.success ? applyZoneEffect(session, participant, zone.id, parsedEffect.data) : { type: "unsupported", effect };
  });

  return {
    participantId,
    zoneId: zone.id,
    previousLocationId,
    effects
  };
}

function eventGesture(event: EventInput): string | undefined {
  return event.gesture ?? (typeof event.payload.gesture === "string" ? event.payload.gesture : undefined);
}

function resolveActionId(session: Session, event: EventInput): string | undefined {
  const explicitActionId = event.actionId ?? (typeof event.payload.actionId === "string" ? event.payload.actionId : undefined);
  if (explicitActionId) {
    return explicitActionId;
  }

  const gesture = eventGesture(event);
  if (!gesture) {
    return undefined;
  }
  if (!event.participantId) {
    throw new Error("Gesture event requires participantId");
  }

  const participant = session.participants.find((candidate) => candidate.id === event.participantId);
  if (!participant) {
    throw new Error("Unknown participant");
  }

  const module = getModuleOrThrow(session.moduleId);
  const matchingActions = module.actions.filter((action) => action.gesture === gesture);
  if (matchingActions.length === 0) {
    throw new Error(`Unknown gesture: ${gesture}`);
  }

  const availableAction = matchingActions.find((action) => actionBlockedBy(session, participant, action).length === 0);
  if (!availableAction) {
    throw new Error(`Gesture ${gesture} has no available action`);
  }
  return availableAction.id;
}

function actorMatches(actionActor: string, participant: Participant): boolean {
  return actionActor === "*" || actionActor === "any" || participant.roleId === actionActor;
}

function applyActionEvent(session: Session, event: EventInput): Record<string, unknown> | undefined {
  const actionId = resolveActionId(session, event);
  if (!actionId) {
    return undefined;
  }

  const module = getModuleOrThrow(session.moduleId);
  const action = module.actions.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }
  if (!event.participantId) {
    throw new Error("Action event requires participantId");
  }

  const participant = session.participants.find((candidate) => candidate.id === event.participantId);
  if (!participant) {
    throw new Error("Unknown participant");
  }
  if (!actorMatches(action.actor, participant)) {
    throw new Error(`Action ${actionId} is not allowed for participant role`);
  }
  if (action.phase !== "*" && action.phase !== currentPhase(session).id) {
    throw new Error(`Action ${actionId} is not allowed during current phase`);
  }

  for (const [resourceId, cost] of Object.entries(action.cost ?? {})) {
    assertResourceChange(module, participant, resourceId, -cost);
  }

  const appliedCosts = Object.entries(action.cost ?? {}).map(([resourceId, cost]) => adjustResource(module, participant, resourceId, -cost));
  const parsedEffect = knownEffectSchema.safeParse(action.effect);
  const appliedEffect = parsedEffect.success
    ? applyEffect(module, participant, parsedEffect.data, event)
    : createPendingActionResolution(session, module, participant, action, event) ?? { type: "unsupported", effect: action.effect };

  return {
    actionId,
    gesture: eventGesture(event),
    participantId: participant.id,
    costs: appliedCosts,
    effect: appliedEffect
  };
}

function actionBlockedBy(session: Session, participant: Participant, action: GameModule["actions"][number]): string[] {
  const module = getModuleOrThrow(session.moduleId);
  const blockedBy: string[] = [];

  if (!actorMatches(action.actor, participant)) {
    blockedBy.push("role");
  }
  if (action.phase !== "*" && action.phase !== currentPhase(session).id) {
    blockedBy.push("phase");
  }
  for (const [resourceId, cost] of Object.entries(action.cost ?? {})) {
    try {
      assertResourceChange(module, participant, resourceId, -cost);
    } catch {
      blockedBy.push(`resource:${resourceId}`);
    }
  }

  return blockedBy;
}

function actionAvailability(session: Session, participant: Participant): ActionAvailability[] {
  const module = getModuleOrThrow(session.moduleId);
  return module.actions.map((action) => {
    const blockedBy = actionBlockedBy(session, participant, action);
    return {
      id: action.id,
      name: action.name,
      phase: action.phase,
      gesture: action.gesture,
      fallback: action.fallback,
      mechanicId: action.mechanicId,
      available: blockedBy.length === 0,
      blockedBy
    };
  });
}

function minimalReadModel(session: Session): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  return {
    code: session.code,
    readModel: "device.unbound",
    module: {
      id: module.id,
      name: module.name,
      resources: module.resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        visibility: resource.visibility
      })),
      roles: module.roles.map((role) => ({
        id: role.id,
        name: role.name
      }))
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

function defaultComponentPools(module: GameModule): Record<string, ComponentPool> {
  return Object.fromEntries(
    module.components.map((component) => [
      component.id,
      {
        componentId: component.id,
        remaining: component.count ?? 0,
        exhausted: (component.count ?? 0) === 0
      }
    ])
  );
}

function incrementCount(target: Record<string, number>, key: string | undefined): void {
  if (!key) {
    return;
  }
  target[key] = (target[key] ?? 0) + 1;
}

function aggregateSession(session: Session): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  const resourceTotals: Record<string, { total: number; min: number; max: number; average: number; participantCount: number }> = {};
  const inventoryTotals: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};

  for (const resource of module.resources) {
    const values = session.participants.map((participant) => participant.resources[resource.id] ?? resource.min ?? 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    resourceTotals[resource.id] = {
      total,
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
      average: values.length > 0 ? total / values.length : 0,
      participantCount: values.length
    };
  }

  for (const participant of session.participants) {
    incrementCount(roleCounts, participant.roleId);
    incrementCount(locationCounts, participant.locationId);
    for (const [componentId, count] of Object.entries(participant.inventory)) {
      inventoryTotals[componentId] = (inventoryTotals[componentId] ?? 0) + count;
    }
  }

  return {
    participants: {
      total: session.participants.length,
      byRole: roleCounts,
      byLocation: locationCounts
    },
    resources: resourceTotals,
    inventory: inventoryTotals,
    componentPools: Object.fromEntries(
      Object.entries(session.componentPools).map(([componentId, pool]) => [
        componentId,
        {
          remaining: pool.remaining,
          exhausted: pool.exhausted
        }
      ])
    )
  };
}

function visibleSession(session: Session): Session & { module: GameModule; phase: z.infer<typeof phaseSchema> } {
  return {
    ...session,
    phase: currentPhase(session),
    module: getModuleOrThrow(session.moduleId)
  };
}

function dashboardReadModel(session: Session): ReturnType<typeof visibleSession> & { readModel: "dashboard"; aggregates: Record<string, unknown> } {
  return {
    ...visibleSession(session),
    aggregates: aggregateSession(session),
    messages: session.messages,
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
      name: module.name,
      resources: module.resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        visibility: resource.visibility
      })),
      roles: module.roles.map((role) => ({
        id: role.id,
        name: role.name
      }))
    },
    phase: currentPhase(session),
    participant,
    availableActions: actionAvailability(session, participant),
    pendingResolutions: session.pendingResolutions.filter((resolution) => resolution.participantId === participant.id),
    exchanges: session.exchanges.filter((exchange) => exchange.fromParticipantId === participant.id || exchange.toParticipantId === participant.id),
    messages: visibleMessagesForParticipant(session, participant.id),
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
    inventory: {},
    statuses: {}
  };
}

function renderIndex(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thaumacord Demo</title>
  <style>
    :root { color-scheme: dark; --bg: #101214; --panel: #181b1f; --line: #343a42; --ink: #f2f4f5; --muted: #aab2bb; --accent: #b94b42; --blue: #315875; --green: #3f6b4d; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--ink); }
    main { width: min(1440px, 100%); margin: 0 auto; padding: 20px; }
    h1 { margin: 0; font-size: 28px; font-weight: 700; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    h3 { margin: 12px 0 8px; font-size: 14px; color: var(--muted); }
    section { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: var(--panel); min-width: 0; }
    label { display: block; margin: 8px 0 4px; color: var(--muted); font-size: 13px; }
    input, select, button, textarea { font: inherit; border-radius: 6px; border: 1px solid #4b535d; padding: 9px; }
    input, select, textarea { width: 100%; background: #0d0f11; color: var(--ink); }
    textarea { min-height: 72px; resize: vertical; }
    button { background: var(--accent); color: white; cursor: pointer; margin-top: 10px; min-height: 40px; }
    button.secondary { background: var(--blue); }
    button.neutral { background: #30363d; }
    button.success { background: var(--green); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
    .layout { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: start; }
    .stack { display: grid; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill { display: inline-block; padding: 4px 8px; border: 1px solid #59616b; border-radius: 999px; margin: 2px; font-size: 12px; color: #dce1e6; }
    .muted { color: var(--muted); }
    .list { display: grid; gap: 8px; }
    .item { border: 1px solid #2f353c; border-radius: 8px; padding: 10px; background: #111417; }
    .item strong { display: block; margin-bottom: 4px; }
    pre { white-space: pre-wrap; background: #0d0f11; padding: 12px; border-radius: 6px; overflow: auto; max-height: 420px; }
    .error { color: #ffb1a8; min-height: 20px; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .topbar { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div>
        <h1>Thaumacord</h1>
        <div class="muted">Putsch au Panador core</div>
      </div>
      <div>
        <a href="/play" class="pill">App participant</a>
        <span id="summary"></span>
      </div>
    </div>

    <div class="layout">
      <div class="stack">
        <section>
          <h2>Session</h2>
        <label for="module">Module</label>
        <select id="module"></select>
          <div class="actions">
            <button id="create">Creer</button>
            <button id="seed" class="success">Scenario 4 joueurs</button>
            <button id="refresh" class="secondary">Rafraichir</button>
          </div>
        <label for="code">Code session</label>
        <input id="code" placeholder="ABC123" />
          <div class="error" id="error"></div>
        </section>

        <section>
          <h2>Participant</h2>
          <label for="participantName">Nom</label>
          <input id="participantName" placeholder="Ana" />
          <label for="roleId">Role</label>
          <select id="roleId"></select>
          <button id="createParticipant">Creer participant</button>

          <label for="deviceName">Appareil</label>
          <input id="deviceName" placeholder="Telephone Ana" />
          <button id="createDevice" class="secondary">Creer appareil</button>

          <label for="bindDeviceId">Appareil a lier</label>
          <select id="bindDeviceId"></select>
          <label for="bindParticipantId">Participant</label>
          <select id="bindParticipantId"></select>
          <button id="bind" class="secondary">Lier</button>
        </section>

        <section>
          <h2>Echange</h2>
          <label for="exchangeFrom">Depuis</label>
          <select id="exchangeFrom"></select>
          <label for="exchangeTo">Vers</label>
          <select id="exchangeTo"></select>
          <div class="row">
            <div>
              <label for="exchangeResource">Ressource</label>
              <select id="exchangeResource"></select>
            </div>
            <div>
              <label for="exchangeAmount">Quantite</label>
              <input id="exchangeAmount" type="number" min="1" value="1" />
            </div>
          </div>
          <button id="exchange" class="success">Transferer</button>
        </section>

        <section>
          <h2>Facilitateur</h2>
          <label for="messageTarget">Cible</label>
          <select id="messageTarget"></select>
          <label for="messageText">Message</label>
          <textarea id="messageText">Le marche ouvre.</textarea>
          <button id="sendMessage">Envoyer</button>

          <h3>Role</h3>
          <label for="roleParticipant">Participant</label>
          <select id="roleParticipant"></select>
          <label for="assignRoleId">Role a attribuer</label>
          <select id="assignRoleId"></select>
          <button id="assignRole" class="secondary">Attribuer role</button>

          <h3>Correction</h3>
          <label for="resourceParticipant">Participant</label>
          <select id="resourceParticipant"></select>
          <div class="row">
            <div>
              <label for="resourceId">Ressource</label>
              <select id="resourceId"></select>
            </div>
            <div>
              <label for="resourceValue">Valeur</label>
              <input id="resourceValue" type="number" value="0" />
            </div>
          </div>
          <button id="setResource" class="neutral">Corriger</button>
          <button id="advance" class="secondary">Phase suivante</button>
        </section>
      </div>

      <div class="stack">
        <section>
          <h2>Table</h2>
          <div class="grid">
            <div>
              <h3>Participants</h3>
              <div id="participants" class="list"></div>
            </div>
            <div>
              <h3>Appareils</h3>
              <div id="devices" class="list"></div>
            </div>
          </div>
        </section>

        <section>
          <h2>Suivi</h2>
          <div class="grid">
            <div>
              <h3>Agregats</h3>
              <pre id="aggregates">{}</pre>
            </div>
            <div>
              <h3>Messages</h3>
              <div id="messages" class="list"></div>
            </div>
            <div>
              <h3>Resolutions</h3>
              <div id="pendingResolutions" class="list"></div>
            </div>
          </div>
        </section>

        <section>
          <h2>Audit</h2>
          <pre id="audit">[]</pre>
        </section>

        <section>
          <h2>Etat brut</h2>
          <pre id="state">Aucune session chargee.</pre>
        </section>
      </div>
    </div>
  </main>
  <script>
    let sessionCode = "";
    let currentSession;
    let liveSocket;
    const demoPlayers = [
      { name: "Ana", roleId: "general" },
      { name: "Basile", roleId: "dealer" },
      { name: "Carmen", roleId: "general" },
      { name: "Diego", roleId: "dealer" }
    ];
    function byId(id) { return document.querySelector("#" + id); }
    function setError(message) { byId("error").textContent = message || ""; }
    function option(value, label) { return '<option value="' + value + '">' + label + '</option>'; }
    function dashboardRoleLabel(session, roleId) {
      return session.module.roles.find((role) => role.id === roleId)?.name || roleId || "sans role";
    }
    function dashboardResourceLabel(session, resourceId) {
      return session.module.resources.find((resource) => resource.id === resourceId)?.name || resourceId;
    }
    function connectLive(code) {
      if (liveSocket) liveSocket.close();
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      liveSocket = new WebSocket(protocol + "://" + location.host + "/sessions/" + code + "/live?dashboard=true");
      liveSocket.addEventListener("message", async (event) => {
        const data = JSON.parse(event.data);
        if (data.readModel) {
          render(data.readModel);
        }
      });
    }
    async function api(url, options) {
      const res = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    async function run(action) {
      try {
        setError("");
        await action();
      } catch (error) {
        setError(error.message);
      }
    }
    async function loadModules() {
      const list = await api("/modules");
      byId("module").innerHTML = list.map((m) => option(m.id, m.name)).join("");
      byId("module").value = "putsch-lite";
      await loadModuleDetails("putsch-lite");
    }
    async function loadModuleDetails(moduleId) {
      const module = await api("/modules/" + moduleId);
      byId("roleId").innerHTML = module.roles.map((role) => option(role.id, role.name)).join("");
      byId("assignRoleId").innerHTML = module.roles.map((role) => option(role.id, role.name)).join("");
      byId("exchangeResource").innerHTML = module.resources.map((resource) => option(resource.id, resource.name)).join("");
      byId("resourceId").innerHTML = module.resources.map((resource) => option(resource.id, resource.name)).join("");
    }
    async function refresh() {
      const code = byId("code").value || sessionCode;
      if (!code) return;
      const session = await api("/sessions/" + code + "/read-models/dashboard");
      render(session);
    }
    function render(session) {
      currentSession = session;
      sessionCode = session.code;
      byId("code").value = session.code;
      byId("summary").innerHTML = [
        '<span class="pill">Code ' + session.code + '</span>',
        '<span class="pill">' + session.module.name + '</span>',
        '<span class="pill">Phase ' + session.phase.name + '</span>',
        '<span class="pill">' + session.devices.length + ' appareil(s)</span>',
        '<span class="pill">' + session.participants.length + ' participant(s)</span>'
      ].join(" ");
      byId("participants").innerHTML = session.participants.map((participant) => {
        const resources = Object.entries(participant.resources).map(([key, value]) => dashboardResourceLabel(session, key) + ": " + value).join(" / ");
        return '<div class="item"><strong>' + participant.name + '</strong><div>' + dashboardRoleLabel(session, participant.roleId) + '</div><div class="muted">' + resources + '</div></div>';
      }).join("") || '<div class="muted">Aucun participant</div>';
      byId("devices").innerHTML = session.devices.map((device) => {
        const participant = session.participants.find((candidate) => candidate.id === device.participantId);
        return '<div class="item"><strong>' + device.name + '</strong><div>' + (participant ? participant.name : "non lie") + '</div><div class="muted">' + (device.connected ? "connecte" : "deconnecte") + '</div></div>';
      }).join("") || '<div class="muted">Aucun appareil</div>';
      byId("aggregates").textContent = JSON.stringify(session.aggregates || {}, null, 2);
      byId("messages").innerHTML = (session.messages || []).slice(-6).map((message) => '<div class="item"><strong>' + message.channel + '</strong><div>' + message.text + '</div><div class="muted">' + message.target + '</div></div>').join("") || '<div class="muted">Aucun message</div>';
      byId("pendingResolutions").innerHTML = (session.pendingResolutions || []).map((resolution) => {
        const participant = session.participants.find((candidate) => candidate.id === resolution.participantId);
        const payload = resolution.payload ? JSON.stringify(resolution.payload) : "";
        return '<div class="item"><strong>' + resolution.type + '</strong><div>' + (participant ? participant.name : "table") + '</div><div class="muted">' + (resolution.mechanicId || resolution.mechanicFamily || "sans mecanique") + '</div><div class="muted">' + payload + '</div><button class="secondary resolveResolution" data-resolution-id="' + resolution.id + '">Marquer resolue</button></div>';
      }).join("") || '<div class="muted">Aucune resolution en attente</div>';
      byId("audit").textContent = JSON.stringify((session.audit || []).slice(-12), null, 2);
      byId("state").textContent = JSON.stringify(session, null, 2);
      syncSelectors(session);
    }
    function syncSelectors(session) {
      const participantOptions = session.participants.map((participant) => option(participant.id, participant.name)).join("");
      const messageOptions = option("allParticipants", "Tous") + option("dashboard", "Dashboard") + session.participants.map((participant) => option("participant:" + participant.id, participant.name)).join("");
      byId("bindParticipantId").innerHTML = participantOptions;
      byId("exchangeFrom").innerHTML = participantOptions;
      byId("exchangeTo").innerHTML = participantOptions;
      byId("resourceParticipant").innerHTML = participantOptions;
      byId("roleParticipant").innerHTML = participantOptions;
      byId("messageTarget").innerHTML = messageOptions;
      byId("bindDeviceId").innerHTML = session.devices.map((device) => option(device.id, device.name + (device.participantId ? " (lie)" : ""))).join("");
    }
    byId("module").addEventListener("change", async () => loadModuleDetails(byId("module").value));
    byId("create").addEventListener("click", () => run(async () => {
      const moduleId = byId("module").value;
      const session = await api("/sessions", { method: "POST", body: JSON.stringify({ moduleId }) });
      sessionCode = session.code;
      byId("code").value = session.code;
      connectLive(session.code);
      render(session);
    }));
    byId("seed").addEventListener("click", () => run(async () => {
      byId("module").value = "putsch-lite";
      await loadModuleDetails("putsch-lite");
      const session = await api("/sessions", { method: "POST", body: JSON.stringify({ moduleId: "putsch-lite" }) });
      sessionCode = session.code;
      byId("code").value = session.code;
      connectLive(session.code);
      for (const player of demoPlayers) {
        const participant = await api("/sessions/" + session.code + "/participants", { method: "POST", body: JSON.stringify({ name: player.name, roleId: player.roleId }) });
        const device = await api("/sessions/" + session.code + "/devices", { method: "POST", body: JSON.stringify({ name: "Telephone " + player.name }) });
        await api("/sessions/" + session.code + "/devices/" + device.device.id + "/bind", { method: "POST", body: JSON.stringify({ participantId: participant.participant.id }) });
      }
      await api("/sessions/" + session.code + "/messages", { method: "POST", body: JSON.stringify({ target: "allParticipants", channel: "demo", text: "Le marche ouvre." }) });
      await refresh();
    }));
    byId("createParticipant").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/participants", { method: "POST", body: JSON.stringify({ name: byId("participantName").value, roleId: byId("roleId").value }) });
      byId("participantName").value = "";
      await refresh();
    }));
    byId("createDevice").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/devices", { method: "POST", body: JSON.stringify({ name: byId("deviceName").value }) });
      byId("deviceName").value = "";
      await refresh();
    }));
    byId("bind").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/devices/" + byId("bindDeviceId").value + "/bind", { method: "POST", body: JSON.stringify({ participantId: byId("bindParticipantId").value }) });
      await refresh();
    }));
    byId("exchange").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/exchanges", { method: "POST", body: JSON.stringify({
        fromParticipantId: byId("exchangeFrom").value,
        toParticipantId: byId("exchangeTo").value,
        resources: { [byId("exchangeResource").value]: Number(byId("exchangeAmount").value) }
      }) });
      await refresh();
    }));
    byId("sendMessage").addEventListener("click", () => run(async () => {
      const selected = byId("messageTarget").value;
      const payload = selected.startsWith("participant:")
        ? { target: "participant", participantId: selected.slice("participant:".length), text: byId("messageText").value, channel: "facilitator" }
        : { target: selected, text: byId("messageText").value, channel: "facilitator" };
      await api("/sessions/" + sessionCode + "/messages", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
    }));
    byId("assignRole").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/players/" + byId("roleParticipant").value + "/role", { method: "POST", body: JSON.stringify({ roleId: byId("assignRoleId").value }) });
      await refresh();
    }));
    byId("pendingResolutions").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest(".resolveResolution");
      if (!button) return;
      await api("/sessions/" + sessionCode + "/resolutions/" + button.dataset.resolutionId + "/resolve", { method: "POST", body: JSON.stringify({ outcome: "facilitator-resolved" }) });
      await refresh();
    }));
    byId("setResource").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/players/" + byId("resourceParticipant").value + "/resources", { method: "POST", body: JSON.stringify({ resourceId: byId("resourceId").value, value: Number(byId("resourceValue").value) }) });
      await refresh();
    }));
    byId("advance").addEventListener("click", () => run(async () => {
      const code = byId("code").value || sessionCode;
      await api("/sessions/" + code + "/phases/advance", { method: "POST", body: JSON.stringify({}) });
      await refresh();
    }));
    byId("refresh").addEventListener("click", () => run(refresh));
    loadModules();
  </script>
</body>
</html>`;
}

function renderParticipantApp(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thaumacord Participant</title>
  <style>
    :root { color-scheme: dark; --bg: #101214; --panel: #181b1f; --line: #343a42; --ink: #f2f4f5; --muted: #aab2bb; --accent: #b94b42; --green: #3f6b4d; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--ink); }
    main { width: min(560px, 100%); margin: 0 auto; padding: 16px; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    section { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: var(--panel); margin: 14px 0; }
    label { display: block; margin: 10px 0 5px; color: var(--muted); font-size: 13px; }
    input, select, button { width: 100%; font: inherit; border-radius: 6px; border: 1px solid #4b535d; padding: 11px; }
    input, select { background: #0d0f11; color: var(--ink); }
    button { background: var(--accent); color: white; cursor: pointer; margin-top: 12px; min-height: 44px; }
    button.secondary { background: #315875; }
    button.success { background: var(--green); }
    .muted { color: var(--muted); }
    .pill { display: inline-block; padding: 4px 8px; border: 1px solid #59616b; border-radius: 999px; margin: 2px; font-size: 12px; color: #dce1e6; }
    .stack { display: grid; gap: 10px; }
    .item { border: 1px solid #2f353c; border-radius: 8px; padding: 10px; background: #111417; }
    .error { color: #ffb1a8; min-height: 20px; }
    .hidden { display: none; }
    pre { white-space: pre-wrap; background: #0d0f11; padding: 12px; border-radius: 6px; overflow: auto; max-height: 260px; }
  </style>
</head>
<body>
  <main>
    <h1>Thaumacord</h1>
    <div class="muted">App participant</div>

    <section id="joinPanel">
      <h2>Rejoindre une session</h2>
      <label for="code">Code MJ</label>
      <input id="code" autocomplete="off" placeholder="ABC123" />
      <button id="loadSession" class="secondary">Charger les roles</button>
      <label for="name">Nom</label>
      <input id="name" autocomplete="name" placeholder="Ana" />
      <label for="roleId">Role</label>
      <select id="roleId"><option value="">Le MJ attribuera</option></select>
      <button id="join">Entrer dans la partie</button>
      <div class="error" id="error"></div>
    </section>

    <section id="tablePanel" class="hidden">
      <h2 id="participantTitle">Participant</h2>
      <div id="summary"></div>
      <h3>Ressources</h3>
      <div id="resources" class="stack"></div>
      <h3>Echange</h3>
      <label for="exchangeTo">Vers</label>
      <select id="exchangeTo"></select>
      <label for="exchangeResource">Ressource</label>
      <select id="exchangeResource"></select>
      <label for="exchangeAmount">Quantite</label>
      <input id="exchangeAmount" type="number" min="1" value="1" />
      <button id="sendExchange" class="success">Transferer</button>
      <h3>Historique des echanges</h3>
      <div id="exchanges" class="stack"></div>
      <h3>Messages</h3>
      <div id="messages" class="stack"></div>
      <h3>Actions disponibles</h3>
      <div id="actions" class="stack"></div>
      <button id="leave" class="secondary">Oublier cet appareil</button>
    </section>

    <section>
      <h2>Etat appareil</h2>
      <pre id="state">Non connecte.</pre>
    </section>
  </main>
  <script>
    let liveSocket;
    let deviceId = localStorage.getItem("thaumacord.deviceId") || "";
    let sessionCode = localStorage.getItem("thaumacord.sessionCode") || "";
    function byId(id) { return document.querySelector("#" + id); }
    function option(value, label) { return '<option value="' + value + '">' + label + '</option>'; }
    function setError(message) { byId("error").textContent = message || ""; }
    async function api(url, options) {
      const res = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    async function run(action) {
      try {
        setError("");
        await action();
      } catch (error) {
        setError(error.message);
      }
    }
    async function loadSession() {
      const code = byId("code").value.trim().toUpperCase();
      if (!code) return;
      const session = await api("/sessions/" + code);
      byId("roleId").innerHTML = option("", "Le MJ attribuera") + session.module.roles.map((role) => option(role.id, role.name)).join("");
      sessionCode = session.code;
      byId("code").value = session.code;
    }
    async function refreshDevice() {
      if (!sessionCode || !deviceId) return;
      const result = await api("/sessions/" + sessionCode + "/devices/" + deviceId + "/sync");
      render(result.readModel);
    }
    function connectLive(code, id) {
      if (liveSocket) liveSocket.close();
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      liveSocket = new WebSocket(protocol + "://" + location.host + "/sessions/" + code + "/live?deviceId=" + id);
      liveSocket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.readModel) render(data.readModel);
      });
    }
    function resourceLabel(model, resourceId) {
      return model.module.resources.find((resource) => resource.id === resourceId)?.name || resourceId;
    }
    function roleLabel(model, roleId) {
      return model.module.roles.find((role) => role.id === roleId)?.name || roleId || "role a attribuer";
    }
    function render(model) {
      byId("state").textContent = JSON.stringify(model, null, 2);
      if (model.readModel === "device.unbound") {
        byId("joinPanel").classList.remove("hidden");
        byId("tablePanel").classList.add("hidden");
        return;
      }
      byId("joinPanel").classList.add("hidden");
      byId("tablePanel").classList.remove("hidden");
      byId("participantTitle").textContent = model.participant.name;
      byId("summary").innerHTML = [
        '<span class="pill">' + model.module.name + '</span>',
        '<span class="pill">Phase ' + model.phase.name + '</span>',
        '<span class="pill">' + roleLabel(model, model.participant.roleId) + '</span>'
      ].join(" ");
      byId("resources").innerHTML = Object.entries(model.participant.resources || {}).map(([key, value]) => '<div class="item"><strong>' + resourceLabel(model, key) + '</strong><div>' + value + '</div></div>').join("") || '<div class="muted">Aucune ressource</div>';
      const otherParticipants = (model.visibleParticipants || []).filter((participant) => participant.id !== model.participant.id);
      byId("exchangeTo").innerHTML = otherParticipants.map((participant) => option(participant.id, participant.name + (participant.roleId ? " (" + roleLabel(model, participant.roleId) + ")" : ""))).join("");
      byId("exchangeResource").innerHTML = Object.keys(model.participant.resources || {}).map((resourceId) => option(resourceId, resourceLabel(model, resourceId))).join("");
      byId("sendExchange").disabled = otherParticipants.length === 0;
      byId("exchanges").innerHTML = (model.exchanges || []).slice(-5).map((exchange) => {
        const direction = exchange.fromParticipantId === model.participant.id ? "envoye" : "recu";
        const resources = Object.entries(exchange.resources).map(([key, value]) => resourceLabel(model, key) + ": " + value).join(" / ");
        return '<div class="item"><strong>' + direction + '</strong><div>' + resources + '</div></div>';
      }).join("") || '<div class="muted">Aucun echange</div>';
      byId("messages").innerHTML = (model.messages || []).slice(-5).map((message) => '<div class="item"><strong>' + message.channel + '</strong><div>' + message.text + '</div></div>').join("") || '<div class="muted">Aucun message</div>';
      byId("actions").innerHTML = (model.availableActions || []).filter((action) => action.available).map((action) => '<div class="item"><strong>' + action.name + '</strong><div class="muted">' + (action.fallback || action.id) + '</div><button class="secondary actionButton" data-action-id="' + action.id + '">Declencher</button></div>').join("") || '<div class="muted">Aucune action disponible</div>';
    }
    byId("loadSession").addEventListener("click", () => run(loadSession));
    byId("join").addEventListener("click", () => run(async () => {
      const selectedRoleId = byId("roleId").value;
      await loadSession();
      const payload = { name: byId("name").value.trim() };
      if (selectedRoleId) payload.roleId = selectedRoleId;
      const result = await api("/sessions/" + sessionCode + "/join", { method: "POST", body: JSON.stringify(payload) });
      deviceId = result.device.id;
      sessionCode = result.sessionCode;
      localStorage.setItem("thaumacord.deviceId", deviceId);
      localStorage.setItem("thaumacord.sessionCode", sessionCode);
      connectLive(sessionCode, deviceId);
      render(result.readModel);
    }));
    byId("sendExchange").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/exchanges", { method: "POST", body: JSON.stringify({
        sourceDeviceId: deviceId,
        toParticipantId: byId("exchangeTo").value,
        resources: { [byId("exchangeResource").value]: Number(byId("exchangeAmount").value) }
      }) });
      await refreshDevice();
    }));
    byId("actions").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest(".actionButton");
      if (!button) return;
      await api("/sessions/" + sessionCode + "/events", { method: "POST", body: JSON.stringify({
        type: "action.triggered",
        sourceDeviceId: deviceId,
        actionId: button.dataset.actionId,
        payload: {}
      }) });
      await refreshDevice();
    }));
    byId("leave").addEventListener("click", () => {
      localStorage.removeItem("thaumacord.deviceId");
      localStorage.removeItem("thaumacord.sessionCode");
      location.reload();
    });
    if (sessionCode) byId("code").value = sessionCode;
    if (sessionCode && deviceId) {
      connectLive(sessionCode, deviceId);
      api("/sessions/" + sessionCode + "/devices/" + deviceId + "/sync").then((result) => render(result.readModel)).catch(() => {});
    }
  </script>
</body>
</html>`;
}

await loadModules();

app.get("/", async (_request, reply) => reply.type("text/html").send(renderIndex()));
app.get("/play", async (_request, reply) => reply.type("text/html").send(renderParticipantApp()));
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
    components: module.components.length,
    setup: Boolean(module.setup),
    mechanics: module.mechanics.length,
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
    phaseClock: phaseClock(module, 0, 1),
    devices: [],
    participants: [],
    unlockedPhases: [module.phases[0].id],
    risks: {},
    componentPools: defaultComponentPools(module),
    pendingResolutions: [],
    exchanges: [],
    messages: [],
    nextAuditSequence: 1,
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
  if (input.roleId && !module.roles.some((role) => role.id === input.roleId)) {
    return reply.code(400).send({ error: "Unknown role" });
  }

  const participant = createParticipant(module, { name: input.name, kind: "person", roleId: input.roleId });
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
  audit(session, "participant.joined", { participantId: participant.id, name: participant.name, roleId: participant.roleId });
  audit(session, "participant.bound_to_device", { participantId: participant.id, deviceId: device.id });
  broadcast(session, "participant.joined", { participantId: participant.id, deviceId: device.id });
  return reply.code(201).send({
    device,
    participant,
    sessionCode: session.code,
    readModel: readModelForAudience(session, { kind: "device", deviceId: device.id })
  });
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

app.post("/sessions/:code/devices/:deviceId/heartbeat", async (request, reply) => {
  const { code, deviceId } = request.params as { code: string; deviceId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const device = getDevice(session, deviceId);
  if (!device) {
    return reply.code(404).send({ error: "Device not found" });
  }

  const heartbeat = markDeviceConnection(session, device, true);
  return {
    heartbeat,
    readModel: readModelForAudience(session, { kind: "device", deviceId })
  };
});

app.post("/sessions/:code/devices/:deviceId/disconnect", async (request, reply) => {
  const { code, deviceId } = request.params as { code: string; deviceId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const device = getDevice(session, deviceId);
  if (!device) {
    return reply.code(404).send({ error: "Device not found" });
  }

  const disconnect = markDeviceConnection(session, device, false);
  return {
    disconnect,
    dashboard: dashboardReadModel(session)
  };
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

app.get("/sessions/:code/audit", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const query = auditQuerySchema.parse(request.query);
  return auditCatchUp(session, query.after, query.limit);
});

app.get("/sessions/:code/devices/:deviceId/sync", async (request, reply) => {
  const { code, deviceId } = request.params as { code: string; deviceId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  if (!getDevice(session, deviceId)) {
    return reply.code(404).send({ error: "Device not found" });
  }

  const query = auditQuerySchema.parse(request.query);
  return {
    readModel: readModelForAudience(session, { kind: "device", deviceId }),
    audit: auditCatchUp(session, query.after, query.limit)
  };
});

app.post("/sessions/:code/messages", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = sessionMessageSchema.parse(request.body);
  let message: SessionMessage;
  try {
    message = createSessionMessage(session, input);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Message rejected" });
  }

  audit(session, "message.sent", { message });
  broadcast(session, "message.sent", session.audit.at(-1));
  return reply.code(202).send({
    accepted: true,
    message,
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/resolutions/:resolutionId/resolve", async (request, reply) => {
  const { code, resolutionId } = request.params as { code: string; resolutionId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = resolveResolutionSchema.parse(request.body ?? {});
  let resolveResult: Record<string, unknown>;
  try {
    resolveResult = resolvePendingResolution(session, resolutionId, input);
  } catch (error) {
    return reply.code(404).send({ error: error instanceof Error ? error.message : "Resolution not found" });
  }

  audit(session, "resolution.resolved", resolveResult);
  broadcast(session, "resolution.resolved", session.audit.at(-1));
  return reply.code(202).send({
    accepted: true,
    resolveResult,
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/setup/distribute", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  let setupResult: Record<string, unknown>;
  try {
    setupResult = runSetupDistribution(session);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Setup rejected" });
  }

  audit(session, "setup.distributed", setupResult);
  broadcast(session, "setup.distributed", session.audit.at(-1));
  return reply.code(202).send({
    accepted: true,
    setupResult,
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/components/draw", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = drawComponentSchema.parse(request.body);
  if (input.sourceDeviceId && !getDevice(session, input.sourceDeviceId)) {
    return reply.code(400).send({ error: "Unknown source device" });
  }

  const participantId = inferParticipantId(session, input.participantId, input.sourceDeviceId);
  if (!participantId) {
    return reply.code(400).send({ error: "Participant required" });
  }

  let drawResult: Record<string, unknown>;
  try {
    drawResult = drawComponentsToParticipant(session, participantId, input.componentId, input.count);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Component draw rejected" });
  }

  audit(session, "component.drawn", { sourceDeviceId: input.sourceDeviceId, reason: input.reason, ...drawResult });
  broadcast(session, "component.drawn", session.audit.at(-1));
  return reply.code(202).send({
    accepted: true,
    drawResult,
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/exchanges", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = exchangeSchema.parse(request.body);
  if (input.sourceDeviceId && !getDevice(session, input.sourceDeviceId)) {
    return reply.code(400).send({ error: "Unknown source device" });
  }

  const fromParticipantId = inferParticipantId(session, input.fromParticipantId, input.sourceDeviceId);
  if (!fromParticipantId) {
    return reply.code(400).send({ error: "Source participant required" });
  }

  let exchangeResult: Record<string, unknown>;
  try {
    exchangeResult = createExchange(session, fromParticipantId, input.toParticipantId, input.resources);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Exchange rejected" });
  }

  audit(session, "exchange.completed", { sourceDeviceId: input.sourceDeviceId, ...exchangeResult });
  broadcast(session, "exchange.completed", session.audit.at(-1));
  return reply.code(202).send({
    accepted: true,
    exchangeResult,
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/zones/:zoneId/presence", async (request, reply) => {
  const { code, zoneId } = request.params as { code: string; zoneId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = zonePresenceSchema.parse(request.body);
  if (input.sourceDeviceId && !getDevice(session, input.sourceDeviceId)) {
    return reply.code(400).send({ error: "Unknown source device" });
  }
  const participantId = inferParticipantId(session, input.participantId, input.sourceDeviceId);
  if (!participantId) {
    return reply.code(400).send({ error: "Participant required" });
  }

  let zoneResult: Record<string, unknown>;
  try {
    zoneResult = enterZone(session, participantId, zoneId);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Zone presence rejected" });
  }

  audit(session, "zone.entered", { sourceDeviceId: input.sourceDeviceId, ...zoneResult });
  broadcast(session, "zone.entered", session.audit.at(-1));
  return reply.code(202).send({
    accepted: true,
    zoneResult,
    dashboard: dashboardReadModel(session)
  });
});

app.post("/sessions/:code/events", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const parsedEvent = eventSchema.parse(request.body);
  if (parsedEvent.sourceDeviceId && !getDevice(session, parsedEvent.sourceDeviceId)) {
    return reply.code(400).send({ error: "Unknown source device" });
  }
  if (parsedEvent.participantId && !participantExists(session, parsedEvent.participantId)) {
    return reply.code(400).send({ error: "Unknown participant" });
  }
  const event = withInferredParticipant(session, parsedEvent);

  let actionResult: Record<string, unknown> | undefined;
  try {
    actionResult = applyActionEvent(session, event);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Event rejected" });
  }

  audit(session, event.type, {
    actionId: event.actionId,
    gesture: event.gesture,
    sourceDeviceId: event.sourceDeviceId,
    participantId: event.participantId,
    payload: event.payload,
    actionResult
  });
  broadcast(session, "event.accepted", session.audit.at(-1));

  return reply.code(202).send({
    accepted: true,
    audit: session.audit.at(-1),
    actionResult,
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
  const nextPhaseIndex = (session.phaseIndex + 1) % module.phases.length;
  const nextTurn = nextPhaseIndex === 0 ? session.phaseClock.turn + 1 : session.phaseClock.turn;
  session.phaseIndex = nextPhaseIndex;
  session.phaseClock = phaseClock(module, session.phaseIndex, nextTurn);
  audit(session, "phase.changed", { phaseId: currentPhase(session).id, phaseIndex: session.phaseIndex, phaseClock: session.phaseClock });
  broadcast(session, "phase.changed", { phaseId: currentPhase(session).id, phaseIndex: session.phaseIndex, phaseClock: session.phaseClock });
  return visibleSession(session);
});

app.post("/sessions/:code/phases/timer", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = phaseTimerSchema.parse(request.body);
  const clock = setPhaseTimer(session, input);
  audit(session, "phase.timer_set", { phaseClock: clock });
  broadcast(session, "phase.timer_set", { phaseClock: clock });
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
