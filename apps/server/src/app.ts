import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";

function envValue(name: string, legacyName: string): string | undefined {
  return process.env[name] ?? process.env[legacyName];
}

export const app = Fastify({ logger: envValue("LUDOVIVE_LOGGER", "THAUMACORD_LOGGER") === "true" });
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

const resourceScoreSchema = z.object({
  pointsPerUnit: z.number().optional(),
  valueState: z.string().min(1).optional(),
  roleMultipliers: z.record(z.number()).default({}),
  label: z.string().optional()
}).refine((value) => value.pointsPerUnit !== undefined || value.valueState !== undefined, {
  message: "pointsPerUnit or valueState is required"
});

const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  visibility: z.string().default("private"),
  min: z.number().optional(),
  max: z.number().optional(),
  score: resourceScoreSchema.optional()
});

const phaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  durationSeconds: z.number().int().positive().optional()
});

const roleSheetSchema = z.object({
  universe: z.string().optional(),
  identity: z.string().optional(),
  publicFace: z.string().optional(),
  secretBriefing: z.string().optional(),
  objective: z.string().optional(),
  howToWin: z.string().optional(),
  howToPlay: z.string().optional(),
  tableBehavior: z.string().optional(),
  firstMoves: z.array(z.string()).default([]),
  keyRules: z.array(z.string()).default([]),
  phaseFocus: z.array(z.object({
    phase: z.string().optional(),
    title: z.string().optional(),
    bullets: z.array(z.string()).default([])
  })).default([]),
  negotiationHooks: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  reminders: z.array(z.string()).default([])
});

const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  officialRole: z.string().optional(),
  secretRole: z.string().optional(),
  startingResources: z.record(z.number()).default({}),
  responsibilities: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  roleSheet: roleSheetSchema.optional(),
  victoryCondition: z.unknown().optional()
});

const sessionRoleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  canInjectGameElements: z.boolean().default(false),
  optional: z.boolean().default(false),
  assignableToRoles: z.array(z.string()).default([]),
  defaultRoleId: z.string().min(1).optional(),
  modes: z.array(z.string()).default([])
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
  count: z.number().int().positive().optional(),
  countResource: z.string().min(1).optional(),
  visibility: z.string().default("private")
}).refine((value) => value.count !== undefined || value.countResource !== undefined, {
  message: "count or countResource is required"
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

const uiThemeSchema = z.object({
  template: z.string().min(1).default("tabletop"),
  tone: z.string().min(1).optional(),
  fonts: z.object({
    display: z.string().optional(),
    body: z.string().optional(),
    numeric: z.string().optional()
  }).default({}),
  colors: z.object({
    background: z.string().optional(),
    panel: z.string().optional(),
    ink: z.string().optional(),
    muted: z.string().optional(),
    accent: z.string().optional(),
    secondary: z.string().optional(),
    success: z.string().optional(),
    warning: z.string().optional()
  }).default({}),
  icons: z.record(z.string()).default({}),
  interactionLabels: z.object({
    primary: z.string().optional(),
    fallback: z.string().optional()
  }).default({})
}).default({ template: "tabletop", colors: {}, icons: {}, interactionLabels: {} });

const soundCueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  channel: z.enum(["ambient", "event", "alert", "stinger"]).default("event"),
  event: z.string().min(1).optional(),
  phase: z.string().min(1).optional(),
  tone: z.string().optional(),
  url: z.string().optional(),
  visibility: z.enum(["dashboard", "participants", "all"]).default("all")
});

function assetsDir(): string {
  return path.resolve(process.cwd(), "../../assets");
}

function assetReferenceToUrl(reference: string | undefined, kind: "icon" | "sound"): string {
  if (!reference) return "";
  const folder = kind === "icon" ? "icons" : "sounds";
  const extension = kind === "icon" ? ".svg" : ".wav";
  if (reference.startsWith(`/${folder}/`)) return `/assets${reference}`;
  if (reference.startsWith(`/assets/${folder}/`)) return reference;
  if (reference.startsWith(`${kind}:`)) {
    const name = reference.slice(kind.length + 1).replace(/[^a-z0-9-]/gi, "");
    return name ? `/assets/${folder}/${name}${extension}` : "";
  }
  return "";
}

const rulesSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  audience: z.enum(["all", "dashboard", "participants"]).default("all")
});

const rulesReferenceSchema = z.object({
  summary: z.string().optional(),
  sections: z.array(rulesSectionSchema).default([])
}).default({ sections: [] });

const moduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  pitch: z.string().optional(),
  inspirationNotes: z.string().optional(),
  rules: rulesReferenceSchema,
  timeline: z.unknown().optional(),
  uiTheme: uiThemeSchema,
  soundboard: z.array(soundCueSchema).default([]),
  state: z.record(z.unknown()).default({}),
  players: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive()
  }),
  teamMode: z.unknown().optional(),
  resources: z.array(resourceSchema).default([]),
  phases: z.array(phaseSchema).min(1),
  sessionRoles: z.array(sessionRoleSchema).default([]),
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

type ResolutionOutcome = {
  id: string;
  label: string;
  description: string;
  effects?: ResolutionEffect[];
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

type TurnPhaseView = {
  turn: number;
  phase: z.infer<typeof phaseSchema> & {
    index: number;
    total: number;
  };
  startedAt: string;
  durationSeconds?: number;
  endsAt?: string;
  facilitatorControlled: boolean;
};

type PhasePlanAction = {
  id: string;
  name: string;
  actor: string;
  target: string;
  mechanicId?: string;
  mechanicFamily?: string;
  mode: "control" | "resolution";
  gesture?: string;
  gestureLabel?: string;
  available?: boolean;
  blockedBy?: string[];
};

type PhasePlanView = {
  phaseId: string;
  phaseName: string;
  turn: number;
  actions: PhasePlanAction[];
  playableActionCount: number;
  pendingResolutionCount: number;
  nextPhase: {
    id: string;
    name: string;
    index: number;
    startsNextTurn: boolean;
  };
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

type SessionRoleAssignment = {
  sessionRoleId: string;
  participantId?: string;
  enabled: boolean;
  assignedAt: string;
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
  statuses: Record<string, unknown>;
  sessionRoleAssignments: Record<string, SessionRoleAssignment>;
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
  gestureLabel?: string;
  fallback?: string;
  mechanicId?: string;
  mechanicFamily?: string;
  inputs?: unknown[];
  available: boolean;
  blockedBy: string[];
};

type PhaseResolutionParticipant = {
  id: string;
  name: string;
  role: "actor" | "defender" | "leader" | "attendee" | "candidate" | "involved";
};

type PhaseResolutionView = {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  status: "pending";
  actionId?: string;
  mechanicId?: string;
  mechanicFamily?: string;
  deadline?: unknown;
  participants: PhaseResolutionParticipant[];
  inputHints: unknown[];
};

const modules = new Map<string, GameModule>();
const sessions = new Map<string, Session>();
const liveClients = new Map<string, Set<{ audience: Audience; send: (payload: string) => void }>>();
const pendingPersistence = new Set<Promise<void>>();

export function resetRuntimeState(): void {
  sessions.clear();
  liveClients.clear();
}

function persistenceEnabled(): boolean {
  return envValue("LUDOVIVE_PERSISTENCE", "THAUMACORD_PERSISTENCE") !== "false";
}

function persistenceDir(): string {
  return envValue("LUDOVIVE_DATA_DIR", "THAUMACORD_DATA_DIR") ?? path.resolve(process.cwd(), "../../.ludovive/sessions");
}

function persistenceFilePath(code: string): string {
  return path.join(persistenceDir(), `${code.toUpperCase()}.json`);
}

async function persistSession(session: Session): Promise<void> {
  if (!persistenceEnabled()) {
    return;
  }
  await mkdir(persistenceDir(), { recursive: true });
  await writeFile(persistenceFilePath(session.code), JSON.stringify(session, null, 2), "utf8");
}

function schedulePersistSession(session: Session): void {
  const task = persistSession(session)
    .catch((error) => {
      app.log.warn({ error, code: session.code }, "Session persistence failed");
    })
    .finally(() => {
      pendingPersistence.delete(task);
    });
  pendingPersistence.add(task);
}

export async function flushSessionPersistence(): Promise<void> {
  await Promise.all([...pendingPersistence]);
}

export async function loadPersistedSessions(): Promise<void> {
  if (!persistenceEnabled()) {
    return;
  }

  let files: string[];
  try {
    files = await readdir(persistenceDir());
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const file of files.filter((candidate) => candidate.endsWith(".json"))) {
    const raw = await readFile(path.join(persistenceDir(), file), "utf8");
    const session = JSON.parse(raw) as Session;
    if (session.code && modules.has(session.moduleId)) {
      sessions.set(session.code.toUpperCase(), session);
    }
  }
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

const assignSessionRoleSchema = z.object({
  participantId: z.string().min(1).optional(),
  enabled: z.boolean().default(true)
});

const setResourceSchema = z.object({
  resourceId: z.string().min(1),
  value: z.number().int()
});

const setSessionStateSchema = z.object({
  state: z.string().min(1),
  value: z.unknown()
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

const resolutionResourceDeltaEffectSchema = z.object({
  type: z.literal("adjustResource"),
  participantId: z.string().min(1).optional(),
  resource: z.string().min(1),
  delta: z.number().int()
});

const resolutionSetStateEffectSchema = z.object({
  type: z.literal("setState"),
  participantId: z.string().min(1).optional(),
  state: z.string().min(1),
  value: z.unknown().optional()
});

const resolutionSetSessionStateEffectSchema = z.object({
  type: z.literal("setSessionState"),
  state: z.string().min(1),
  value: z.unknown().optional()
});

const resolutionAdjustSessionCounterEffectSchema = z.object({
  type: z.literal("adjustSessionCounter"),
  state: z.string().min(1),
  delta: z.number().int(),
  min: z.number().optional(),
  max: z.number().optional()
});

const resolutionScaleSessionCounterEffectSchema = z.object({
  type: z.literal("scaleSessionCounter"),
  state: z.string().min(1),
  factor: z.number().positive(),
  rounding: z.enum(["floor", "ceil", "round"]).default("round"),
  min: z.number().optional(),
  max: z.number().optional()
});

const resolutionEffectSchema = z.discriminatedUnion("type", [
  resolutionResourceDeltaEffectSchema,
  resolutionSetStateEffectSchema,
  resolutionSetSessionStateEffectSchema,
  resolutionAdjustSessionCounterEffectSchema,
  resolutionScaleSessionCounterEffectSchema
]);
const resolutionOutcomeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
  effects: z.array(resolutionEffectSchema).optional()
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

const runTimedIncomeEffectSchema = z.object({
  type: z.literal("runTimedIncome"),
  resource: z.string().min(1),
  amountResource: z.string().min(1),
  componentId: z.string().min(1).optional(),
  oddTurnCount: z.number().int().nonnegative().default(0),
  evenTurnCount: z.number().int().nonnegative().default(0),
  turnState: z.string().min(1).default("currentTurn"),
  fixedDrawByRole: z.record(z.number().int().nonnegative()).default({}),
  bonusDrawByRole: z.record(z.number().int().nonnegative()).default({}),
  lowStatusResource: z.string().min(1).optional(),
  lowStatusThreshold: z.number().int().optional(),
  lowStatusIncomeMultiplier: z.number().nonnegative().default(1),
  excludeRoles: z.array(z.string()).default([])
});

const castVoteEffectSchema = z.object({
  type: z.literal("castVote"),
  resource: z.string().min(1),
  state: z.string().min(1)
});

const finalizeVoteEffectSchema = z.object({
  type: z.literal("finalizeVote"),
  state: z.string().min(1),
  resultState: z.string().min(1),
  promotionSlots: z.number().int().nonnegative().default(0),
  eliminationSlots: z.number().int().nonnegative().default(0),
  promotedParticipantState: z.string().min(1).optional(),
  eliminatedParticipantState: z.string().min(1).optional()
});

const castPetitionVoteEffectSchema = z.object({
  type: z.literal("castPetitionVote"),
  resource: z.string().min(1),
  resolutionMechanicId: z.string().min(1),
  choices: z.array(z.string().min(1)).default(["for", "against"]),
  voteState: z.string().min(1).default("petitionVotes")
});

const resolvePetitionEffectSchema = z.object({
  type: z.literal("resolvePetition"),
  resolutionMechanicId: z.string().min(1),
  allowedOutcomes: z.array(z.string().min(1)).default(["accepted", "rejected", "deferred"]),
  resultState: z.string().min(1).default("lastPetitionResult")
});

const marketBuyEffectSchema = z.object({
  type: z.literal("marketBuy"),
  resource: z.string().min(1),
  currencyResource: z.string().min(1),
  priceState: z.string().min(1),
  stockState: z.string().min(1).optional(),
  limitState: z.string().min(1).optional(),
  sellerRoleId: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
  purchaseState: z.string().min(1).default("marketPurchases")
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
  revealContactHintEffectSchema,
  runTimedIncomeEffectSchema,
  castVoteEffectSchema,
  finalizeVoteEffectSchema,
  castPetitionVoteEffectSchema,
  resolvePetitionEffectSchema,
  marketBuyEffectSchema
]);

const knownZoneEffectSchema = z.discriminatedUnion("type", [
  unlockPhaseZoneEffectSchema,
  increaseRiskZoneEffectSchema,
  periodicDamageCheckZoneEffectSchema
]);

type KnownEffect = z.infer<typeof knownEffectSchema>;
type KnownZoneEffect = z.infer<typeof knownZoneEffectSchema>;
type ResolutionEffect = z.infer<typeof resolutionEffectSchema>;
type EventInput = z.infer<typeof eventSchema>;

function modulesDir(): string {
  return path.resolve(process.cwd(), "../../modules/examples");
}

function serverPort(): number {
  return Number(envValue("PORT", "THAUMACORD_PORT") ?? 3333);
}

function serverHost(): string {
  return envValue("LUDOVIVE_HOST", "THAUMACORD_HOST") ?? "0.0.0.0";
}

function localNetworkAddresses(): { name: string; address: string; family: string; url: string }[] {
  const port = serverPort();
  const entries = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => ({
        name,
        address: address.address,
        family: address.family,
        url: `http://${address.address}:${port}/`
      }))
  );
  return entries.sort((left, right) => left.name.localeCompare(right.name) || left.address.localeCompare(right.address));
}

function networkReadModel(): Record<string, unknown> {
  const port = serverPort();
  const interfaces = localNetworkAddresses();
  return {
    ok: true,
    service: "ludovive-server",
    mode: "pc-wifi-host",
    host: serverHost(),
    port,
    uptimeSeconds: Math.round(process.uptime()),
    sessions: sessions.size,
    liveClientSessions: liveClients.size,
    localhost: {
      dashboardUrl: `http://127.0.0.1:${port}/`,
      participantUrl: `http://127.0.0.1:${port}/play`
    },
    interfaces,
    recommendedUrls: interfaces.map((entry) => ({
      name: entry.name,
      dashboardUrl: entry.url,
      participantUrl: `${entry.url}play`
    })),
    websocket: {
      dashboardPath: "/sessions/:code/live?dashboard=true",
      devicePath: "/sessions/:code/live?deviceId=:deviceId"
    },
    tableReliability: {
      heartbeatPath: "/sessions/:code/devices/:deviceId/heartbeat",
      syncPath: "/sessions/:code/devices/:deviceId/sync?after=:sequence&limit=:limit",
      guidance: [
        "Use the same Wi-Fi network for PC and phones.",
        "Prefer a 5 GHz network or a dedicated phone hotspot for playtests.",
        "Keep the PC awake and plugged in.",
        "If WebSocket drops, clients should heartbeat then sync."
      ]
    }
  };
}

function assertModuleReference(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function validateModuleReferences(module: GameModule): void {
  const componentIds = new Set(module.components.map((component) => component.id));
  const phaseIds = new Set(module.phases.map((phase) => phase.id));
  const roleIds = new Set(module.roles.map((role) => role.id));
  const resourceIds = new Set(module.resources.map((resource) => resource.id));
  const mechanicIds = new Set(module.mechanics.map((mechanic) => mechanic.id));
  const stateIds = new Set(Object.keys(module.state));
  const actionIds = new Set<string>();

  for (const resource of module.resources) {
    if (resource.score?.valueState) {
      assertModuleReference(stateIds.has(resource.score.valueState), `Module ${module.id} resource ${resource.id} scores from unknown state: ${resource.score.valueState}`);
    }
  }

  for (const cue of module.soundboard) {
    if (cue.phase) {
      assertModuleReference(phaseIds.has(cue.phase), `Module ${module.id} sound cue ${cue.id} references unknown phase: ${cue.phase}`);
    }
  }

  for (const distribution of module.setup?.distributions ?? []) {
    assertModuleReference(componentIds.has(distribution.componentId), `Module ${module.id} setup distribution references unknown component: ${distribution.componentId}`);
    assertModuleReference(!distribution.countResource || resourceIds.has(distribution.countResource), `Module ${module.id} setup distribution references unknown resource: ${distribution.countResource}`);
    assertModuleReference(distribution.target !== "role" || Boolean(distribution.roleId && roleIds.has(distribution.roleId)), `Module ${module.id} setup distribution references unknown role: ${distribution.roleId}`);
  }

  for (const action of module.actions) {
    assertModuleReference(!actionIds.has(action.id), `Module ${module.id} has duplicate action id: ${action.id}`);
    actionIds.add(action.id);
    assertModuleReference(action.phase === "*" || phaseIds.has(action.phase), `Module ${module.id} action ${action.id} references unknown phase: ${action.phase}`);
    assertModuleReference(action.actor === "any" || roleIds.has(action.actor), `Module ${module.id} action ${action.id} references unknown actor role: ${action.actor}`);
    assertModuleReference(!action.mechanicId || mechanicIds.has(action.mechanicId), `Module ${module.id} action ${action.id} references unknown mechanic: ${action.mechanicId}`);

    const effect = objectRecord(action.effect);
    if (!effect?.type) {
      continue;
    }
    if (typeof effect.resource === "string") {
      assertModuleReference(resourceIds.has(effect.resource), `Module ${module.id} action ${action.id} references unknown resource: ${effect.resource}`);
    }
    if (typeof effect.currencyResource === "string") {
      assertModuleReference(resourceIds.has(effect.currencyResource), `Module ${module.id} action ${action.id} references unknown currency resource: ${effect.currencyResource}`);
    }
    for (const resourceId of stringArray(effect.resources) ?? []) {
      assertModuleReference(resourceIds.has(resourceId), `Module ${module.id} action ${action.id} references unknown resource: ${resourceId}`);
    }
    if (typeof effect.componentId === "string") {
      assertModuleReference(componentIds.has(effect.componentId), `Module ${module.id} action ${action.id} references unknown component: ${effect.componentId}`);
    }
    if (typeof effect.amountResource === "string") {
      assertModuleReference(resourceIds.has(effect.amountResource), `Module ${module.id} action ${action.id} references unknown amount resource: ${effect.amountResource}`);
    }
    if (typeof effect.lowStatusResource === "string") {
      assertModuleReference(resourceIds.has(effect.lowStatusResource), `Module ${module.id} action ${action.id} references unknown low-status resource: ${effect.lowStatusResource}`);
    }
    if (typeof effect.sellerRoleId === "string") {
      assertModuleReference(roleIds.has(effect.sellerRoleId), `Module ${module.id} action ${action.id} references unknown seller role: ${effect.sellerRoleId}`);
    }
    for (const stateKey of [effect.priceState, effect.stockState, effect.limitState].filter((value): value is string => typeof value === "string")) {
      assertModuleReference(stateIds.has(stateKey), `Module ${module.id} action ${action.id} references unknown session state: ${stateKey}`);
    }
  }
}

async function loadModules(): Promise<void> {
  const moduleFiles = ["putsch-lite.json", "long-live-the-king-lite.json", "wolfpack-lite.json", "origins-ww1-lite.json"];
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

function turnPhaseView(session: Session): TurnPhaseView {
  const module = getModuleOrThrow(session.moduleId);
  const phase = currentPhase(session);
  return {
    turn: session.phaseClock.turn,
    phase: {
      ...phase,
      index: session.phaseIndex,
      total: module.phases.length
    },
    startedAt: session.phaseClock.phaseStartedAt,
    durationSeconds: session.phaseClock.phaseDurationSeconds,
    endsAt: session.phaseClock.phaseEndsAt,
    facilitatorControlled: session.phaseClock.facilitatorControlled
  };
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
  schedulePersistSession(session);
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

function resolutionOutcomeLabel(resolution: PendingResolution, outcomeId: string): string {
  return resolutionOutcomes(resolution).find((outcome) => outcome.id === outcomeId)?.label ?? outcomeId;
}

function resolutionResolvedText(session: Session, resolution: PendingResolution, input: z.infer<typeof resolveResolutionSchema>): string {
  const label = resolutionOutcomeLabel(resolution, input.outcome);
  const summary = resolutionSummary(session, resolution);
  return input.note ? `Resolution: ${summary} -> ${label}. ${input.note}` : `Resolution: ${summary} -> ${label}.`;
}

function resolutionEffectTarget(session: Session, resolution: PendingResolution, effect: ResolutionEffect): Participant {
  const participantId = ("participantId" in effect ? effect.participantId : undefined) ?? resolution.participantId;
  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    throw new Error("Resolution effect requires a known participant");
  }
  return participant;
}

function declaredResolutionOutcomes(resolution: PendingResolution): ResolutionOutcome[] {
  const declaration = objectRecord(resolution.resolution);
  const parsed = z.array(resolutionOutcomeSchema).safeParse(declaration?.outcomes);
  return parsed.success ? parsed.data : [];
}

function defaultResolutionEffects(resolution: PendingResolution): ResolutionEffect[] {
  const declaration = objectRecord(resolution.resolution);
  const parsed = z.array(resolutionEffectSchema).safeParse(declaration?.defaultEffects);
  return parsed.success ? parsed.data : [];
}

function liveAdministrationPayloadEffects(resolution: PendingResolution): ResolutionEffect[] {
  if (resolution.mechanicFamily !== "live-administration") {
    return [];
  }

  const payload = objectRecord(resolution.payload);
  const embezzlement = objectRecord(payload?.embezzlement);
  const money = Number(embezzlement?.money ?? 0);
  if (!Number.isFinite(money) || money <= 0) {
    return [];
  }

  return [{ type: "adjustResource", resource: "money", delta: Math.floor(money) }];
}

function resourceBundleTotal(resources: Record<string, unknown> | undefined): number {
  return Object.values(resources ?? {}).reduce<number>((sum, value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

function contestCommitmentPayload(participantId: string, resources: Record<string, number>): Record<string, unknown> {
  return {
    participantId,
    resources,
    total: resourceBundleTotal(resources),
    committedAt: new Date().toISOString()
  };
}

function commitmentDeadline(session: Session): Record<string, unknown> {
  const durationSeconds = Math.max(1, Math.floor(Number(session.statuses.coupCommitmentSeconds ?? currentPhase(session).durationSeconds ?? 120)));
  return {
    durationSeconds,
    endsAt: new Date(Date.now() + durationSeconds * 1000).toISOString()
  };
}

function contestedCoupOutcome(resolution: PendingResolution): string | undefined {
  const payload = objectRecord(resolution.payload);
  const commitments = objectRecord(payload?.commitments);
  const attacker = objectRecord(commitments?.attacker);
  const defender = objectRecord(commitments?.defender);
  if (!attacker || !defender) {
    return undefined;
  }
  const attackerTotal = Number(attacker.total ?? 0);
  const defenderTotal = Number(defender.total ?? 0);
  if (attackerTotal > defenderTotal) return "attacker-wins";
  if (defenderTotal > attackerTotal) return "defender-wins";
  return "tie-facilitator";
}

function contestCommitmentSummary(resolution: PendingResolution): Record<string, unknown> {
  const payload = objectRecord(resolution.payload);
  const commitments = objectRecord(payload?.commitments);
  const attacker = objectRecord(commitments?.attacker);
  const defender = objectRecord(commitments?.defender);
  return {
    attacker: attacker ? {
      participantId: attacker.participantId,
      total: Number(attacker.total ?? 0)
    } : undefined,
    defender: defender ? {
      participantId: defender.participantId,
      total: Number(defender.total ?? 0)
    } : undefined,
    outcome: contestedCoupOutcome(resolution)
  };
}

function resolutionEffects(resolution: PendingResolution, input: z.infer<typeof resolveResolutionSchema>): ResolutionEffect[] {
  const declaredEffects = declaredResolutionOutcomes(resolution).find((outcome) => outcome.id === input.outcome)?.effects ?? [];
  const defaultEffects = defaultResolutionEffects(resolution);
  const payloadEffects = liveAdministrationPayloadEffects(resolution);
  if (!("effects" in input.payload)) {
    return [...declaredEffects, ...defaultEffects, ...payloadEffects];
  }
  return [...declaredEffects, ...defaultEffects, ...payloadEffects, ...z.array(resolutionEffectSchema).parse(input.payload.effects)];
}

function roundedCounter(value: number, rounding: "floor" | "ceil" | "round"): number {
  if (rounding === "floor") return Math.floor(value);
  if (rounding === "ceil") return Math.ceil(value);
  return Math.round(value);
}

function applyResolutionEffects(session: Session, resolution: PendingResolution, input: z.infer<typeof resolveResolutionSchema>): Record<string, unknown>[] {
  const module = getModuleOrThrow(session.moduleId);
  const effects = resolutionEffects(resolution, input);

  for (const effect of effects) {
    if (effect.type === "adjustResource") {
      const participant = resolutionEffectTarget(session, resolution, effect);
      assertResourceChange(module, participant, effect.resource, effect.delta);
    } else if (effect.type === "setState") {
      resolutionEffectTarget(session, resolution, effect);
    } else if (effect.type === "adjustSessionCounter") {
      const before = Number(session.statuses[effect.state] ?? 0);
      if (!Number.isFinite(before)) {
        throw new Error(`Session state ${effect.state} is not numeric`);
      }
      const after = before + effect.delta;
      if (effect.min !== undefined && after < effect.min) {
        throw new Error(`Session state ${effect.state} would be below minimum`);
      }
      if (effect.max !== undefined && after > effect.max) {
        throw new Error(`Session state ${effect.state} would be above maximum`);
      }
    } else if (effect.type === "scaleSessionCounter") {
      const before = Number(session.statuses[effect.state] ?? 0);
      if (!Number.isFinite(before)) {
        throw new Error(`Session state ${effect.state} is not numeric`);
      }
      const after = roundedCounter(before * effect.factor, effect.rounding);
      if (effect.min !== undefined && after < effect.min) {
        throw new Error(`Session state ${effect.state} would be below minimum`);
      }
      if (effect.max !== undefined && after > effect.max) {
        throw new Error(`Session state ${effect.state} would be above maximum`);
      }
    }
  }

  return effects.map((effect) => {
    if (effect.type === "adjustResource") {
      const participant = resolutionEffectTarget(session, resolution, effect);
      return {
        type: effect.type,
        participantId: participant.id,
        ...adjustResource(module, participant, effect.resource, effect.delta)
      };
    }
    if (effect.type === "setSessionState") {
      const before = session.statuses[effect.state];
      const after = effect.value ?? true;
      session.statuses[effect.state] = after;
      return { type: effect.type, state: effect.state, before, after };
    }
    if (effect.type === "adjustSessionCounter") {
      const before = Number(session.statuses[effect.state] ?? 0);
      const after = before + effect.delta;
      session.statuses[effect.state] = after;
      return { type: effect.type, state: effect.state, before, after };
    }
    if (effect.type === "scaleSessionCounter") {
      const before = Number(session.statuses[effect.state] ?? 0);
      const after = roundedCounter(before * effect.factor, effect.rounding);
      session.statuses[effect.state] = after;
      return { type: effect.type, state: effect.state, before, after };
    }

    const participant = resolutionEffectTarget(session, resolution, effect);
    const before = participant.statuses[effect.state];
    const after = effect.value ?? true;
    participant.statuses[effect.state] = after;
    return { type: effect.type, participantId: participant.id, state: effect.state, before, after };
  });
}

function autoResolveResolution(session: Session, resolution: PendingResolution, outcome: string, note?: string): Record<string, unknown> {
  return resolvePendingResolution(session, resolution.id, { outcome, note, payload: {} });
}

function resolvePendingResolution(session: Session, resolutionId: string, input: z.infer<typeof resolveResolutionSchema>): Record<string, unknown> {
  const index = session.pendingResolutions.findIndex((resolution) => resolution.id === resolutionId);
  if (index === -1) {
    throw new Error("Resolution not found");
  }

  const resolution = session.pendingResolutions[index]!;
  const effects = applyResolutionEffects(session, resolution, input);
  session.pendingResolutions.splice(index, 1);
  const publicSummary = objectRecord(resolution.visibility)?.participants === "public-summary";
  const message = createSessionMessage(session, {
    target: resolution.participantId && !publicSummary ? "participant" : "allParticipants",
    participantId: publicSummary ? undefined : resolution.participantId,
    channel: "resolution",
    text: resolutionResolvedText(session, resolution, input)
  });

  return {
    resolutionId,
    resolution,
    outcome: input.outcome,
    note: input.note,
    payload: input.payload,
    effects,
    message,
    resolvedAt: new Date().toISOString()
  };
}

function runSetupDistribution(session: Session): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  const setup = module.setup;
  if (!setup) {
    return { applied: false, reason: "No setup declared", distributions: [] };
  }
  if (session.statuses.setupDistributedAt) {
    return {
      applied: false,
      reason: "Setup already distributed",
      phaseId: setup.phaseId,
      distributedAt: session.statuses.setupDistributedAt,
      distributions: []
    };
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

    const countsByParticipant = Object.fromEntries(
      targets.map((participant) => [
        participant.id,
        distribution.countResource ? Math.max(0, Math.floor(participant.resources[distribution.countResource] ?? 0)) : distribution.count!
      ])
    );
    const totalCount = Object.values(countsByParticipant).reduce((sum, count) => sum + count, 0);

    const draw = drawComponents(session, component.id, totalCount);
    for (const participant of targets) {
      participant.inventory[component.id] = (participant.inventory[component.id] ?? 0) + countsByParticipant[participant.id]!;
    }

    return {
      id: distribution.id,
      componentId: component.id,
      count: distribution.count,
      countResource: distribution.countResource,
      countsByParticipant,
      target: distribution.target,
      roleId: distribution.roleId,
      participantIds: targets.map((participant) => participant.id),
      draw,
      visibility: distribution.visibility
    };
  });

  const distributedAt = new Date().toISOString();
  session.statuses.setupDistributedAt = distributedAt;
  return {
    applied: true,
    phaseId: setup.phaseId,
    distributedAt,
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

function runTimedIncome(session: Session, effect: z.infer<typeof runTimedIncomeEffectSchema>): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  const turn = Number(session.statuses[effect.turnState] ?? session.phaseClock.turn);
  const baseDraw = turn % 2 === 0 ? effect.evenTurnCount : effect.oddTurnCount;
  const targets = session.participants.filter((participant) => !effect.excludeRoles.includes(participant.roleId ?? ""));
  const incomeResults = targets.map((participant) => {
    const rawAmount = Math.max(0, Math.floor(participant.resources[effect.amountResource] ?? 0));
    const lowStatus = effect.lowStatusResource && effect.lowStatusThreshold !== undefined
      ? (participant.resources[effect.lowStatusResource] ?? 0) <= effect.lowStatusThreshold
      : false;
    const amount = lowStatus ? Math.floor(rawAmount * effect.lowStatusIncomeMultiplier) : rawAmount;
    return {
      participantId: participant.id,
      roleId: participant.roleId,
      income: adjustResource(module, participant, effect.resource, amount)
    };
  });

  const componentResults = effect.componentId ? targets.map((participant) => {
    const roleId = participant.roleId ?? "";
    const count = effect.fixedDrawByRole[roleId] ?? (baseDraw + (effect.bonusDrawByRole[roleId] ?? 0));
    if (count <= 0) {
      return { participantId: participant.id, roleId, componentId: effect.componentId, count: 0 };
    }
    return drawComponentsToParticipant(session, participant.id, effect.componentId!, count);
  }) : [];

  return {
    type: effect.type,
    turn,
    resource: effect.resource,
    amountResource: effect.amountResource,
    componentId: effect.componentId,
    participants: targets.map((participant) => participant.id),
    incomeResults,
    componentResults
  };
}

function runCastVote(session: Session, module: GameModule, participant: Participant, effect: z.infer<typeof castVoteEffectSchema>, event: EventInput): Record<string, unknown> {
  const promotionCandidateId = typeof event.payload.promotionCandidateId === "string" ? event.payload.promotionCandidateId : undefined;
  const eliminationCandidateId = typeof event.payload.eliminationCandidateId === "string" ? event.payload.eliminationCandidateId : undefined;
  const candidateId = typeof event.payload.candidateId === "string" ? event.payload.candidateId : promotionCandidateId;
  const votes = Number(event.payload.votes ?? 1);
  if (!candidateId || !participantExists(session, candidateId)) {
    throw new Error("Vote requires a known candidateId");
  }
  if (eliminationCandidateId && !participantExists(session, eliminationCandidateId)) {
    throw new Error("Vote requires a known eliminationCandidateId");
  }
  if (!Number.isInteger(votes) || votes <= 0) {
    throw new Error("Vote count must be a positive integer");
  }

  assertResourceChange(module, participant, effect.resource, -votes);
  const resourceChange = adjustResource(module, participant, effect.resource, -votes);
  const tally = objectRecord(session.statuses[effect.state]) ?? {};
  if (promotionCandidateId || eliminationCandidateId) {
    const promotion = objectRecord(tally.promotion) ?? {};
    const elimination = objectRecord(tally.elimination) ?? {};
    if (promotionCandidateId) {
      promotion[promotionCandidateId] = Number(promotion[promotionCandidateId] ?? 0) + votes;
    }
    if (eliminationCandidateId) {
      elimination[eliminationCandidateId] = Number(elimination[eliminationCandidateId] ?? 0) + votes;
    }
    tally.promotion = promotion;
    tally.elimination = elimination;
  } else {
    const before = Number(tally[candidateId] ?? 0);
    tally[candidateId] = before + votes;
  }
  session.statuses[effect.state] = tally;
  participant.statuses.lastVote = { candidateId, promotionCandidateId, eliminationCandidateId, votes, at: new Date().toISOString() };
  const leaderSource = objectRecord(tally.promotion) ?? tally;
  const leader = Object.entries(leaderSource)
    .map(([participantId, count]) => ({ participantId, votes: Number(count) }))
    .sort((a, b) => b.votes - a.votes)[0];

  return {
    type: effect.type,
    resource: effect.resource,
    state: effect.state,
    candidateId,
    promotionCandidateId,
    eliminationCandidateId,
    votes,
    resourceChange,
    tally,
    leader
  };
}

function voteStandings(session: Session, votes: Record<string, unknown>): Record<string, unknown>[] {
  return Object.entries(votes).map(([participantId, voteCount]) => {
    const participant = session.participants.find((candidate) => candidate.id === participantId);
    return {
      participantId,
      name: participant?.name ?? participantId,
      roleId: participant?.roleId,
      votes: Number(voteCount ?? 0)
    };
  }).sort((left, right) => {
    const voteDiff = Number(right.votes) - Number(left.votes);
    if (voteDiff !== 0) {
      return voteDiff;
    }
    return String(left.name).localeCompare(String(right.name));
  });
}

function selectVoteLeaders(standings: Record<string, unknown>[], slots: number): Record<string, unknown>[] {
  if (slots <= 0) {
    return [];
  }
  return standings.slice(0, slots).map((entry, index) => {
    const next = standings[index + 1];
    const previous = standings[index - 1];
    return {
      ...entry,
      tied: Number(next?.votes) === Number(entry.votes) || Number(previous?.votes) === Number(entry.votes)
    };
  });
}

function runFinalizeVote(session: Session, effect: z.infer<typeof finalizeVoteEffectSchema>): Record<string, unknown> {
  const tally = objectRecord(session.statuses[effect.state]) ?? {};
  const promotionStandings = voteStandings(session, objectRecord(tally.promotion) ?? tally);
  const eliminationStandings = voteStandings(session, objectRecord(tally.elimination) ?? {});
  const promoted = selectVoteLeaders(promotionStandings, effect.promotionSlots);
  const eliminated = selectVoteLeaders(eliminationStandings, effect.eliminationSlots);

  for (const entry of promoted) {
    const participant = session.participants.find((candidate) => candidate.id === entry.participantId);
    if (participant && effect.promotedParticipantState) {
      participant.statuses[effect.promotedParticipantState] = true;
    }
  }
  for (const entry of eliminated) {
    const participant = session.participants.find((candidate) => candidate.id === entry.participantId);
    if (participant && effect.promotedParticipantState) {
      participant.statuses[effect.promotedParticipantState] = false;
    }
    if (participant && effect.eliminatedParticipantState) {
      participant.statuses[effect.eliminatedParticipantState] = true;
    }
  }

  const result = {
    type: effect.type,
    state: effect.state,
    promotionStandings,
    eliminationStandings,
    promoted,
    eliminated,
    needsFacilitatorTieBreak: [...promoted, ...eliminated].some((entry) => entry.tied),
    finalizedAt: new Date().toISOString()
  };
  session.statuses[effect.resultState] = result;
  return result;
}

function findOpenResolution(session: Session, mechanicId: string, resolutionId?: unknown): PendingResolution {
  const resolution = typeof resolutionId === "string"
    ? session.pendingResolutions.find((candidate) => candidate.id === resolutionId)
    : session.pendingResolutions.find((candidate) => candidate.mechanicId === mechanicId);
  if (!resolution || resolution.mechanicId !== mechanicId) {
    throw new Error(`No pending resolution for mechanic ${mechanicId}`);
  }
  return resolution;
}

function petitionVoteTotals(votes: Record<string, unknown>, choices: string[]): Record<string, number> {
  return Object.values(votes).reduce<Record<string, number>>((totals, vote) => {
    const entry = objectRecord(vote);
    const choice = typeof entry?.choice === "string" ? entry.choice : undefined;
    const weight = Number(entry?.weight ?? 0);
    if (choice && choices.includes(choice) && Number.isFinite(weight)) {
      totals[choice] = (totals[choice] ?? 0) + weight;
    }
    return totals;
  }, Object.fromEntries(choices.map((choice) => [choice, 0])));
}

function runCastPetitionVote(session: Session, module: GameModule, participant: Participant, effect: z.infer<typeof castPetitionVoteEffectSchema>, event: EventInput): Record<string, unknown> {
  const pendingResolution = findOpenResolution(session, effect.resolutionMechanicId, event.payload.resolutionId);
  const choice = typeof event.payload.choice === "string" ? event.payload.choice : undefined;
  const weight = Math.floor(Number(event.payload.weight ?? 1));
  if (!choice || !effect.choices.includes(choice)) {
    throw new Error("Petition vote requires a valid choice");
  }
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("Petition vote weight must be a positive integer");
  }

  assertResourceChange(module, participant, effect.resource, -weight);
  const resourceChange = adjustResource(module, participant, effect.resource, -weight);
  const payload = objectRecord(pendingResolution.payload) ?? {};
  const votes = objectRecord(payload[effect.voteState]) ?? {};
  votes[participant.id] = {
    participantId: participant.id,
    choice,
    weight,
    votedAt: new Date().toISOString()
  };
  const totals = petitionVoteTotals(votes, effect.choices);
  pendingResolution.payload = {
    ...payload,
    [effect.voteState]: votes,
    petitionVoteTotals: totals
  };
  participant.statuses.lastPetitionVote = {
    resolutionId: pendingResolution.id,
    choice,
    weight,
    at: new Date().toISOString()
  };

  return {
    type: effect.type,
    resolutionId: pendingResolution.id,
    mechanicId: pendingResolution.mechanicId,
    choice,
    weight,
    resourceChange,
    totals
  };
}

function runResolvePetition(session: Session, effect: z.infer<typeof resolvePetitionEffectSchema>, event: EventInput): Record<string, unknown> {
  if (!hasInjectionAuthority(session)) {
    throw new Error("Injection authority is required for petition resolution");
  }
  const outcome = typeof event.payload.outcome === "string" ? event.payload.outcome : "deferred";
  if (!effect.allowedOutcomes.includes(outcome)) {
    throw new Error("Petition resolution requires a valid outcome");
  }
  const pendingResolution = findOpenResolution(session, effect.resolutionMechanicId, event.payload.resolutionId);
  const payload = objectRecord(pendingResolution.payload) ?? {};
  const result = {
    type: effect.type,
    resolutionId: pendingResolution.id,
    mechanicId: pendingResolution.mechanicId,
    outcome,
    petitionText: payload.petitionText,
    petitionVoteTotals: objectRecord(payload.petitionVoteTotals) ?? {},
    decidedBy: event.participantId,
    decidedAt: new Date().toISOString()
  };
  session.statuses[effect.resultState] = result;
  const resolveResult = resolvePendingResolution(session, pendingResolution.id, {
    outcome,
    note: typeof event.payload.note === "string" ? event.payload.note : undefined,
    payload: objectRecord(event.payload.payload) ?? {}
  });
  return {
    ...result,
    resolveResult
  };
}

function marketPurchaseKey(session: Session, resource: string): string {
  return `${session.phaseClock.turn}:${currentPhase(session).id}:${resource}`;
}

function runMarketBuy(session: Session, module: GameModule, participant: Participant, effect: z.infer<typeof marketBuyEffectSchema>, event: EventInput): Record<string, unknown> {
  const quantity = Math.floor(Number(event.payload.quantity ?? 1));
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Market buy quantity must be a positive integer");
  }

  const price = Number(session.statuses[effect.priceState]);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Market price state is invalid: ${effect.priceState}`);
  }
  const totalCost = quantity * price;
  const stockBefore = effect.stockState ? Number(session.statuses[effect.stockState] ?? 0) : undefined;
  if (stockBefore !== undefined && (!Number.isFinite(stockBefore) || stockBefore < quantity)) {
    throw new Error(`Market stock is insufficient: ${effect.stockState}`);
  }

  const purchaseKey = marketPurchaseKey(session, effect.resource);
  const purchases = objectRecord(participant.statuses[effect.purchaseState]) ?? {};
  const alreadyPurchased = Number(purchases[purchaseKey] ?? 0);
  const limit = effect.limitState ? Number(session.statuses[effect.limitState]) : undefined;
  if (limit !== undefined && Number.isFinite(limit) && alreadyPurchased + quantity > limit) {
    throw new Error(`Market buy exceeds participant limit: ${effect.limitState}`);
  }

  const seller = effect.sellerRoleId
    ? session.participants.find((candidate) => candidate.roleId === effect.sellerRoleId)
    : undefined;
  if (effect.sellerRoleId && !seller) {
    throw new Error(`Market seller role is missing: ${effect.sellerRoleId}`);
  }
  if (seller?.id === participant.id) {
    throw new Error("Market buyer cannot also be the seller");
  }

  assertResourceChange(module, participant, effect.currencyResource, -totalCost);
  assertResourceChange(module, participant, effect.resource, quantity);
  if (seller) {
    assertResourceChange(module, seller, effect.resource, -quantity);
    assertResourceChange(module, seller, effect.currencyResource, totalCost);
  }
  if (effect.componentId && seller && (seller.inventory[effect.componentId] ?? 0) < quantity) {
    throw new Error(`Market seller component stock is insufficient: ${effect.componentId}`);
  }

  const buyerPayment = adjustResource(module, participant, effect.currencyResource, -totalCost);
  const buyerResource = adjustResource(module, participant, effect.resource, quantity);
  const sellerResource = seller ? adjustResource(module, seller, effect.resource, -quantity) : undefined;
  const sellerPayment = seller ? adjustResource(module, seller, effect.currencyResource, totalCost) : undefined;
  const componentTransfer = effect.componentId && seller ? {
    componentId: effect.componentId,
    seller: {
      participantId: seller.id,
      before: seller.inventory[effect.componentId] ?? 0,
      after: (seller.inventory[effect.componentId] ?? 0) - quantity
    },
    buyer: {
      participantId: participant.id,
      before: participant.inventory[effect.componentId] ?? 0,
      after: (participant.inventory[effect.componentId] ?? 0) + quantity
    }
  } : undefined;
  if (componentTransfer && seller) {
    seller.inventory[effect.componentId!] = componentTransfer.seller.after;
    participant.inventory[effect.componentId!] = componentTransfer.buyer.after;
  }
  if (effect.stockState && stockBefore !== undefined) {
    session.statuses[effect.stockState] = stockBefore - quantity;
  }
  purchases[purchaseKey] = alreadyPurchased + quantity;
  participant.statuses[effect.purchaseState] = purchases;

  return {
    type: effect.type,
    resource: effect.resource,
    currencyResource: effect.currencyResource,
    quantity,
    price,
    totalCost,
    buyerId: participant.id,
    sellerId: seller?.id,
    purchaseKey,
    alreadyPurchased,
    purchasedAfter: purchases[purchaseKey],
    limit,
    stock: effect.stockState ? {
      state: effect.stockState,
      before: stockBefore,
      after: session.statuses[effect.stockState]
    } : undefined,
    transfers: {
      buyerPayment,
      buyerResource,
      sellerResource,
      sellerPayment
    },
    componentTransfer
  };
}

function applyEffect(session: Session, module: GameModule, participant: Participant, effect: KnownEffect, event: EventInput): Record<string, unknown> {
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

  if (effect.type === "runTimedIncome") {
    return runTimedIncome(session, effect);
  }

  if (effect.type === "castVote") {
    return runCastVote(session, module, participant, effect, event);
  }

  if (effect.type === "finalizeVote") {
    return runFinalizeVote(session, effect);
  }

  if (effect.type === "castPetitionVote") {
    return runCastPetitionVote(session, module, participant, effect, event);
  }

  if (effect.type === "resolvePetition") {
    return runResolvePetition(session, effect, event);
  }

  if (effect.type === "marketBuy") {
    return runMarketBuy(session, module, participant, effect, event);
  }

  participant.statuses.contactHint = {
    precision: effect.precision,
    hint: typeof event.payload.hint === "string" ? event.payload.hint : undefined
  };
  return { type: effect.type, precision: effect.precision };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function mechanicResourceInput(mechanic: GameModule["mechanics"][number] | undefined): Record<string, unknown> | undefined {
  return mechanic?.inputs.map(objectRecord).find((input) => input?.type === "resource-bundle");
}

function actionAllowedResources(
  module: GameModule,
  action: GameModule["actions"][number],
  mechanic: GameModule["mechanics"][number] | undefined
): string[] {
  const effect = objectRecord(action.effect);
  const mechanicAllowed = stringArray(mechanicResourceInput(mechanic)?.allowed);
  const effectResources = stringArray(effect?.resources);
  const effectResource = typeof effect?.resource === "string" ? [effect.resource] : undefined;
  return effectResources ?? effectResource ?? mechanicAllowed ?? module.resources.map((resource) => resource.id);
}

function actionExchangeResources(
  module: GameModule,
  action: GameModule["actions"][number],
  mechanic: GameModule["mechanics"][number] | undefined,
  payload: Record<string, unknown>
): Record<string, number> {
  const rawResources = objectRecord(payload.resources);
  if (!rawResources) {
    throw new Error("Action exchange requires resources");
  }

  const allowed = new Set(actionAllowedResources(module, action, mechanic));
  if (Object.keys(rawResources).length === 0) {
    throw new Error("Action exchange requires at least one resource");
  }

  return Object.fromEntries(
    Object.entries(rawResources).map(([resourceId, value]) => {
      if (!allowed.has(resourceId)) {
        throw new Error(`Resource ${resourceId} is not allowed for action ${action.id}`);
      }
      const amount = Number(value);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error(`Resource ${resourceId} amount must be a positive integer`);
      }
      return [resourceId, amount];
    })
  );
}

function consumeActionResources(module: GameModule, participant: Participant, resources: Record<string, number>): Record<string, unknown>[] {
  for (const [resourceId, amount] of Object.entries(resources)) {
    assertResourceChange(module, participant, resourceId, -amount);
  }
  return Object.entries(resources).map(([resourceId, amount]) => adjustResource(module, participant, resourceId, -amount));
}

function pushPendingActionResolution(
  session: Session,
  participant: Participant,
  action: GameModule["actions"][number],
  mechanic: GameModule["mechanics"][number],
  payload: Record<string, unknown>
): PendingResolution {
  const pendingResolution: PendingResolution = {
    id: crypto.randomUUID(),
    type: effectType(action.effect, mechanic.family),
    participantId: participant.id,
    actionId: action.id,
    mechanicId: mechanic.id,
    mechanicFamily: mechanic.family,
    payload,
    resolution: mechanic.resolution,
    visibility: mechanic.visibility,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  session.pendingResolutions.push(pendingResolution);
  return pendingResolution;
}

function applyContestAction(
  session: Session,
  module: GameModule,
  participant: Participant,
  action: GameModule["actions"][number],
  mechanic: GameModule["mechanics"][number] | undefined,
  event: EventInput
): Record<string, unknown> | undefined {
  const effect = objectRecord(action.effect);
  if (mechanic?.family !== "contest") {
    return undefined;
  }

  if (effect?.type === "contestedBid") {
    const resources = actionExchangeResources(module, action, mechanic, event.payload);
    const resourceChanges = consumeActionResources(module, participant, resources);
    const payload = {
      ...event.payload,
      commitmentDeadline: commitmentDeadline(session),
      commitments: {
        attacker: contestCommitmentPayload(participant.id, resources)
      }
    };
    const pendingResolution = pushPendingActionResolution(session, participant, action, mechanic, payload);
    return {
      type: "pendingResolution",
      resolutionId: pendingResolution.id,
      mechanicId: mechanic.id,
      mechanicFamily: mechanic.family,
      actionEffectType: pendingResolution.type,
      status: pendingResolution.status,
      resourceChanges,
      commitments: {
        attacker: objectRecord(payload.commitments)?.attacker
      }
    };
  }

  if (effect?.type === "contestResponse") {
    const pendingResolution = session.pendingResolutions.find((resolution) => {
      const payload = objectRecord(resolution.payload);
      return resolution.mechanicId === mechanic.id && payload?.defenderId === participant.id;
    });
    if (!pendingResolution) {
      throw new Error("No pending contest requires this participant");
    }

    const pendingPayload = objectRecord(pendingResolution.payload) ?? {};
    const deadline = objectRecord(pendingPayload.commitmentDeadline);
    if (typeof deadline?.endsAt === "string" && Date.now() > new Date(deadline.endsAt).getTime()) {
      throw new Error("Contest commitment deadline has passed");
    }

    const resources = actionExchangeResources(module, action, mechanic, event.payload);
    const resourceChanges = consumeActionResources(module, participant, resources);
    const payload = pendingPayload;
    const commitments = objectRecord(payload.commitments) ?? {};
    pendingResolution.payload = {
      ...payload,
      commitments: {
        ...commitments,
        defender: contestCommitmentPayload(participant.id, resources)
      }
    };

    const outcome = contestedCoupOutcome(pendingResolution);
    const contest = contestCommitmentSummary(pendingResolution);
    if (!outcome) {
      return {
        type: "contestCommitmentRecorded",
        resolutionId: pendingResolution.id,
        mechanicId: mechanic.id,
        resourceChanges,
        contest
      };
    }

    const resolveResult = autoResolveResolution(session, pendingResolution, outcome, "Resolution automatique des engagements caches.");
    return {
      type: "autoResolvedContest",
      resolutionId: pendingResolution.id,
      mechanicId: mechanic.id,
      outcome,
      contest,
      resourceChanges,
      resolveResult
    };
  }

  return undefined;
}

function applyLiveAdministrationAction(
  session: Session,
  participant: Participant,
  action: GameModule["actions"][number],
  mechanic: GameModule["mechanics"][number] | undefined,
  event: EventInput
): Record<string, unknown> | undefined {
  const effect = objectRecord(action.effect);
  if (mechanic?.family !== "live-administration" || effect?.type !== "recordLiveResults") {
    return undefined;
  }
  if (!hasInjectionAuthority(session)) {
    throw new Error("Injection authority is required for live administration");
  }

  const pendingResolution = pushPendingActionResolution(session, participant, action, mechanic, event.payload);
  const resolveResult = autoResolveResolution(session, pendingResolution, "facilitator-resolved", "Compte rendu applique automatiquement.");
  return {
    type: "autoResolvedLiveAdministration",
    resolutionId: pendingResolution.id,
    mechanicId: mechanic.id,
    resolveResult
  };
}

function applyExchangeAction(
  session: Session,
  module: GameModule,
  participant: Participant,
  action: GameModule["actions"][number],
  mechanic: GameModule["mechanics"][number] | undefined,
  event: EventInput
): Record<string, unknown> | undefined {
  const effect = objectRecord(action.effect);
  const isExchange = mechanic?.family === "exchange" || effect?.type === "transferBundle" || effect?.type === "transferResource";
  if (!isExchange) {
    return undefined;
  }

  const hasTarget = typeof event.payload.toParticipantId === "string";
  const hasResources = Boolean(objectRecord(event.payload.resources));
  if (!hasTarget && !hasResources) {
    return undefined;
  }
  if (!hasTarget) {
    throw new Error("Action exchange requires toParticipantId");
  }
  if (!hasResources) {
    throw new Error("Action exchange requires resources");
  }
  const proximityConfirmed = event.payload.contactConfirmed === true || event.payload.proximity === "near" || Boolean(eventGesture(event));
  if (!proximityConfirmed) {
    throw new Error("Exchange requires phone proximity/contact confirmation");
  }

  const toParticipantId = event.payload.toParticipantId as string;
  const resources = actionExchangeResources(module, action, mechanic, event.payload);
  const exchangeResult = createExchange(session, participant.id, toParticipantId, resources);
  return {
    type: "exchange",
    mechanicId: mechanic?.id,
    mechanicFamily: mechanic?.family,
    exchangeResult
  };
}

function effectType(effect: unknown, fallback: string): string {
  return typeof effect === "object" && effect !== null && "type" in effect && typeof effect.type === "string" ? effect.type : fallback;
}

function opensPendingResolution(mechanic: GameModule["mechanics"][number]): boolean {
  return [
    "petition",
    "vote",
    "contest",
    "facilitator-action",
    "live-administration",
    "triggered-ability",
    "information-action",
    "card-or-object"
  ].includes(mechanic.family);
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

  const pendingResolution = pushPendingActionResolution(session, participant, action, mechanic, event.payload);

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

function knownGestureLabel(gesture: string): string {
  const labels: Record<string, string> = {
    "touch-phones": "toucher les telephones",
    "pour-liquid": "verser vers le telephone de l'autre joueur",
    "shake-phones": "serrer la main en mettant les telephones en contact",
    "tap-stack": "poser le telephone sur la pile ou le titre",
    "palm-cover": "couvrir l'ecran comme une transaction discrete",
    "ballot-drop": "deposer le telephone comme un bulletin dans l'urne",
    "strike-phone": "donner un coup d'epee avec le telephone",
    "parry-phone": "parer avec le telephone",
    "phone-face-down": "retourner le telephone face contre table"
  };
  return labels[gesture] ?? gesture;
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
  const mechanic = action.mechanicId ? module.mechanics.find((candidate) => candidate.id === action.mechanicId) : undefined;
  const parsedEffect = knownEffectSchema.safeParse(action.effect);
  if (parsedEffect.success && parsedEffect.data.type === "runTimedIncome" && !hasInjectionAuthority(session)) {
    throw new Error("Injection authority is required for timed income");
  }
  const appliedEffect = parsedEffect.success
    ? applyEffect(session, module, participant, parsedEffect.data, event)
    : applyContestAction(session, module, participant, action, mechanic, event) ??
      applyLiveAdministrationAction(session, participant, action, mechanic, event) ??
      applyExchangeAction(session, module, participant, action, mechanic, event) ??
      createPendingActionResolution(session, module, participant, action, event) ??
      { type: "unsupported", effect: action.effect };

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
  const effect = objectRecord(action.effect);

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
  if (effect?.type === "contestResponse") {
    const hasPendingContest = session.pendingResolutions.some((resolution) => {
      const payload = objectRecord(resolution.payload);
      return resolution.mechanicId === action.mechanicId && payload?.defenderId === participant.id;
    });
    if (!hasPendingContest) {
      blockedBy.push("pendingContest");
    }
  }
  if (effect?.type === "castPetitionVote") {
    const mechanicId = typeof effect.resolutionMechanicId === "string" ? effect.resolutionMechanicId : action.mechanicId;
    const hasPendingPetition = session.pendingResolutions.some((resolution) => resolution.mechanicId === mechanicId);
    if (!hasPendingPetition) {
      blockedBy.push("pendingPetition");
    }
    const resourceId = typeof effect.resource === "string" ? effect.resource : undefined;
    if (resourceId && (participant.resources[resourceId] ?? 0) <= 0) {
      blockedBy.push(`resource:${resourceId}`);
    }
  }
  if (effect?.type === "resolvePetition") {
    const mechanicId = typeof effect.resolutionMechanicId === "string" ? effect.resolutionMechanicId : action.mechanicId;
    const hasPendingPetition = session.pendingResolutions.some((resolution) => resolution.mechanicId === mechanicId);
    if (!hasPendingPetition) {
      blockedBy.push("pendingPetition");
    }
  }

  return blockedBy;
}

function actionAvailability(session: Session, participant: Participant): ActionAvailability[] {
  const module = getModuleOrThrow(session.moduleId);
  return module.actions.map((action) => {
    const blockedBy = actionBlockedBy(session, participant, action);
    const mechanic = module.mechanics.find((candidate) => candidate.id === action.mechanicId);
    const inputs = (mechanic?.inputs ?? []).filter((input) => {
      if (typeof input !== "object" || input === null) return true;
      return (input as Record<string, unknown>).source !== "actor-or-bound-device";
    }).map((input) => {
      const inputRecord = objectRecord(input);
      if (inputRecord?.type !== "resource-bundle") {
        return input;
      }
      return {
        ...inputRecord,
        allowed: actionAllowedResources(module, action, mechanic)
      };
    });
    return {
      id: action.id,
      name: action.name,
      phase: action.phase,
      gesture: action.gesture,
      gestureLabel: action.gesture ? knownGestureLabel(action.gesture) : undefined,
      fallback: action.fallback,
      mechanicId: action.mechanicId,
      mechanicFamily: mechanic?.family,
      inputs,
      available: blockedBy.length === 0,
      blockedBy
    };
  });
}

function currentPhaseActions(module: GameModule, session: Session): GameModule["actions"] {
  const phaseId = currentPhase(session).id;
  return module.actions.filter((action) => action.phase === "*" || action.phase === phaseId);
}

function mechanicResolutionModes(mechanic: GameModule["mechanics"][number] | undefined): string[] {
  const resolution = objectRecord(mechanic?.resolution);
  if (Array.isArray(resolution?.modes)) {
    return resolution.modes.map(String);
  }
  return typeof resolution?.mode === "string" ? [resolution.mode] : [];
}

function phasePlanActionMode(mechanic: GameModule["mechanics"][number] | undefined): PhasePlanAction["mode"] {
  const modes = mechanicResolutionModes(mechanic);
  return mechanic?.family === "live-administration" || modes.includes("liveThenRecord") || modes.includes("guidedInApp")
    ? "resolution"
    : "control";
}

function phasePlanView(session: Session, participant?: Participant): PhasePlanView {
  const module = getModuleOrThrow(session.moduleId);
  const phase = currentPhase(session);
  const nextPhaseIndex = (session.phaseIndex + 1) % module.phases.length;
  const nextPhase = module.phases[nextPhaseIndex];
  const availability = participant
    ? new Map(actionAvailability(session, participant).map((action) => [action.id, action]))
    : undefined;
  const actions = currentPhaseActions(module, session).map((action) => {
    const mechanic = module.mechanics.find((candidate) => candidate.id === action.mechanicId);
    const participantAction = availability?.get(action.id);
    return {
      id: action.id,
      name: action.name,
      actor: action.actor,
      target: action.target,
      mechanicId: action.mechanicId,
      mechanicFamily: mechanic?.family,
      mode: phasePlanActionMode(mechanic),
      gesture: action.gesture,
      gestureLabel: action.gesture ? knownGestureLabel(action.gesture) : undefined,
      available: participantAction?.available,
      blockedBy: participantAction?.blockedBy
    };
  });

  return {
    phaseId: phase.id,
    phaseName: phase.name,
    turn: session.phaseClock.turn,
    actions,
    playableActionCount: availability ? actions.filter((action) => action.available).length : actions.length,
    pendingResolutionCount: session.pendingResolutions.length,
    nextPhase: {
      id: nextPhase.id,
      name: nextPhase.name,
      index: nextPhaseIndex,
      startsNextTurn: nextPhaseIndex === 0
    }
  };
}

function minimalReadModel(session: Session): Record<string, unknown> {
  const module = getModuleOrThrow(session.moduleId);
  return {
    code: session.code,
    readModel: "device.unbound",
      module: {
        id: module.id,
        name: module.name,
        uiTheme: module.uiTheme,
        resources: module.resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        visibility: resource.visibility
      })),
      roles: module.roles.map((role) => ({
        id: role.id,
        name: role.name,
        officialRole: role.officialRole
      }))
    },
    rulesReference: rulesReference(module, "participants"),
    characterReference: characterReference(module),
    phase: currentPhase(session),
    phaseClock: session.phaseClock,
    turnPhase: turnPhaseView(session),
    phasePlan: phasePlanView(session),
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

function defaultSessionRoleAssignments(module: GameModule): Record<string, SessionRoleAssignment> {
  return Object.fromEntries(
    module.sessionRoles.map((sessionRole) => [
      sessionRole.id,
      {
        sessionRoleId: sessionRole.id,
        enabled: !sessionRole.optional,
        assignedAt: new Date().toISOString()
      }
    ])
  );
}

function assertSessionRoleAssignment(module: GameModule, session: Session, sessionRoleId: string, participantId?: string): z.infer<typeof sessionRoleSchema> {
  const sessionRole = module.sessionRoles.find((candidate) => candidate.id === sessionRoleId);
  if (!sessionRole) {
    throw new Error("Unknown session role");
  }
  if (!participantId) {
    return sessionRole;
  }

  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    throw new Error("Participant not found");
  }
  if (sessionRole.assignableToRoles.length > 0 && (!participant.roleId || !sessionRole.assignableToRoles.includes(participant.roleId))) {
    throw new Error(`Session role ${sessionRoleId} is not assignable to participant role ${participant.roleId ?? "none"}`);
  }
  return sessionRole;
}

function hasInjectionAuthority(session: Session): boolean {
  const module = getModuleOrThrow(session.moduleId);
  const injectionRoles = module.sessionRoles.filter((sessionRole) => sessionRole.canInjectGameElements);
  if (injectionRoles.length === 0) {
    return true;
  }
  return injectionRoles.some((sessionRole) => {
    const assignment = session.sessionRoleAssignments[sessionRole.id];
    return Boolean(assignment?.enabled && assignment.participantId);
  });
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

function resourceScoreUnit(session: Session, resource: z.infer<typeof resourceSchema>): number | undefined {
  if (!resource.score) {
    return undefined;
  }
  const unit = resource.score.valueState ? Number(session.statuses[resource.score.valueState]) : resource.score.pointsPerUnit;
  return Number.isFinite(unit) ? unit : undefined;
}

function scoreParticipants(session: Session): Record<string, unknown>[] {
  const module = getModuleOrThrow(session.moduleId);
  return session.participants.map((participant) => {
    const role = participant.roleId ? module.roles.find((candidate) => candidate.id === participant.roleId) : undefined;
    const breakdown = module.resources.flatMap((resource) => {
      const unit = resourceScoreUnit(session, resource);
      if (!resource.score || unit === undefined) {
        return [];
      }
      const quantity = participant.resources[resource.id] ?? resource.min ?? 0;
      if (!quantity) {
        return [];
      }
      const multiplier = participant.roleId ? resource.score.roleMultipliers[participant.roleId] ?? 1 : 1;
      const points = quantity * unit * multiplier;
      return [{
        resourceId: resource.id,
        name: resource.name,
        quantity,
        unit,
        multiplier,
        points,
        label: resource.score.label
      }];
    });
    const total = breakdown.reduce((sum, entry) => sum + entry.points, 0);
    return {
      participantId: participant.id,
      name: participant.name,
      roleId: participant.roleId,
      roleName: role?.name,
      total,
      breakdown
    };
  }).sort((left, right) => Number(right.total) - Number(left.total));
}

function visibleSession(session: Session): Session & { module: GameModule; phase: z.infer<typeof phaseSchema>; turnPhase: TurnPhaseView; phasePlan: PhasePlanView } {
  return {
    ...session,
    phase: currentPhase(session),
    turnPhase: turnPhaseView(session),
    phasePlan: phasePlanView(session),
    module: getModuleOrThrow(session.moduleId)
  };
}

function roleReference(module: GameModule, role: GameModule["roles"][number] | undefined, includeSecret: boolean): Record<string, unknown> | undefined {
  if (!role) {
    return undefined;
  }
  return {
    id: role.id,
    name: role.name,
    officialRole: role.officialRole,
    secretRole: includeSecret ? role.secretRole : undefined,
    responsibilities: role.responsibilities ?? [],
    actions: role.actions ?? [],
    roleSheet: role.roleSheet,
    victoryCondition: role.victoryCondition,
    startingResources: role.startingResources
  };
}

function roleFocusSections(module: GameModule, participant?: Participant): { id: string; title: string; body?: string; bullets: string[] }[] {
  const role = participant?.roleId ? module.roles.find((candidate) => candidate.id === participant.roleId) : undefined;
  if (!role) {
    return [];
  }
  const sheet = role.roleSheet;
  const bullets = [
    role.officialRole ? `Identite publique: ${role.officialRole}` : undefined,
    role.secretRole ? `Information secrete: ${role.secretRole}` : undefined,
    sheet?.objective ? `Votre objectif: ${sheet.objective}` : undefined,
    sheet?.howToWin ? `Comment gagner: ${sheet.howToWin}` : undefined,
    sheet?.howToPlay ? `Comment jouer: ${sheet.howToPlay}` : undefined,
    ...(sheet?.firstMoves ?? []).map((item) => `Depart: ${item}`),
    ...(sheet?.keyRules ?? []).map((item) => `Regle clef: ${item}`),
    ...(sheet?.reminders ?? []).map((item) => `Rappel: ${item}`)
  ].filter((item): item is string => Boolean(item));
  if (bullets.length === 0) {
    return [];
  }
  return [{
    id: "your-role-focus",
    title: "Pour vous",
    body: sheet?.identity ?? `Vous jouez ${role.name}.`,
    bullets
  }];
}

function rulesReference(module: GameModule, audience: "dashboard" | "participants", participant?: Participant): Record<string, unknown> {
  const explicitSections = (module.rules.sections || [])
    .filter((section) => section.audience === "all" || section.audience === audience)
    .map((section) => ({
      id: section.id,
      title: section.title,
      body: section.body,
      bullets: section.bullets
    }));
  const generatedSections = [
    module.setup
      ? {
          id: "setup",
          title: "Mise en place",
          bullets: module.setup.instructions
        }
      : undefined,
    {
      id: "phases",
      title: "Phases",
      bullets: module.phases.map((phase) => phase.name + (phase.durationSeconds ? ` (${phase.durationSeconds}s)` : ""))
    },
    {
      id: "resources",
      title: "Ressources",
      bullets: module.resources.map((resource) => resource.name)
    },
    {
      id: "mechanics",
      title: "Mecaniques",
      bullets: module.mechanics.map((mechanic) => mechanic.name + (mechanic.summary ? `: ${mechanic.summary}` : ""))
    },
    module.victoryConditions?.length
      ? {
          id: "victory",
          title: "Conditions de victoire",
          bullets: module.victoryConditions.map((condition) => {
            const record = objectRecord(condition);
            return String(record?.text ?? record?.rule ?? record?.name ?? JSON.stringify(condition));
          })
        }
      : undefined
  ].filter((section): section is { id: string; title: string; bullets: string[] } => Boolean(section && section.bullets.length > 0));
  return {
    summary: module.rules.summary ?? module.pitch ?? module.inspirationNotes ?? "",
    sections: [...roleFocusSections(module, participant), ...explicitSections, ...generatedSections]
  };
}

function characterReference(module: GameModule, participant?: Participant, includeAllRoles = false): Record<string, unknown> {
  const ownRole = participant?.roleId ? module.roles.find((role) => role.id === participant.roleId) : undefined;
  return {
    participant: participant
      ? {
          id: participant.id,
          name: participant.name,
          roleId: participant.roleId,
          resources: participant.resources,
          statuses: participant.statuses,
          inventory: participant.inventory
        }
      : undefined,
    ownRole: roleReference(module, ownRole, true),
    roles: includeAllRoles ? module.roles.map((role) => roleReference(module, role, true)) : undefined
  };
}

function participantName(session: Session, participantId?: string): string | undefined {
  return participantId ? session.participants.find((participant) => participant.id === participantId)?.name : undefined;
}

function participantNames(session: Session, participantIds: unknown): string[] {
  return Array.isArray(participantIds)
    ? participantIds.map((participantId) => participantName(session, String(participantId)) ?? String(participantId))
    : [];
}

function phaseResolutionParticipant(session: Session, participantId: unknown, role: PhaseResolutionParticipant["role"]): PhaseResolutionParticipant | undefined {
  if (typeof participantId !== "string") {
    return undefined;
  }
  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    return undefined;
  }
  return {
    id: participant.id,
    name: participant.name,
    role
  };
}

function pushPhaseResolutionParticipant(
  participants: PhaseResolutionParticipant[],
  participant: PhaseResolutionParticipant | undefined
): void {
  if (!participant) {
    return;
  }
  if (participants.some((candidate) => candidate.id === participant.id && candidate.role === participant.role)) {
    return;
  }
  participants.push(participant);
}

function resolutionInputHints(session: Session, resolution: PendingResolution): unknown[] {
  const module = getModuleOrThrow(session.moduleId);
  const mechanic = module.mechanics.find((candidate) => candidate.id === resolution.mechanicId);
  const action = module.actions.find((candidate) => candidate.id === resolution.actionId);
  return (mechanic?.inputs ?? []).filter((input) => {
    const inputRecord = objectRecord(input);
    return inputRecord?.source !== "actor-or-bound-device";
  }).map((input) => {
    const inputRecord = objectRecord(input);
    if (inputRecord?.type !== "resource-bundle") {
      return input;
    }
    return {
      ...inputRecord,
      allowed: action ? actionAllowedResources(module, action, mechanic) : inputRecord.allowed
    };
  });
}

function phaseResolutionView(session: Session, resolution: PendingResolution): PhaseResolutionView {
  const module = getModuleOrThrow(session.moduleId);
  const mechanic = module.mechanics.find((candidate) => candidate.id === resolution.mechanicId);
  const action = module.actions.find((candidate) => candidate.id === resolution.actionId);
  const payload = objectRecord(resolution.payload) ?? {};
  const participants: PhaseResolutionParticipant[] = [];

  pushPhaseResolutionParticipant(participants, phaseResolutionParticipant(session, resolution.participantId, "actor"));
  pushPhaseResolutionParticipant(participants, phaseResolutionParticipant(session, payload.defenderId, "defender"));
  for (const leaderId of Array.isArray(payload.leaderIds) ? payload.leaderIds : []) {
    pushPhaseResolutionParticipant(participants, phaseResolutionParticipant(session, leaderId, "leader"));
  }
  for (const attendeeId of Array.isArray(payload.attendeeIds) ? payload.attendeeIds : []) {
    pushPhaseResolutionParticipant(participants, phaseResolutionParticipant(session, attendeeId, "attendee"));
  }
  pushPhaseResolutionParticipant(participants, phaseResolutionParticipant(session, payload.promotionCandidateId, "candidate"));
  pushPhaseResolutionParticipant(participants, phaseResolutionParticipant(session, payload.eliminationCandidateId, "candidate"));

  const title = action?.name ?? mechanic?.name ?? resolution.type;
  const prompt =
    mechanic?.summary ??
    (resolution.zoneId ? `Resoudre l'effet de zone ${resolution.zoneId}.` : "Resolution de phase a traiter par la table.");

  return {
    id: resolution.id,
    kind: mechanic?.family ?? resolution.type,
    title,
    prompt,
    status: resolution.status,
    actionId: resolution.actionId,
    mechanicId: resolution.mechanicId,
    mechanicFamily: resolution.mechanicFamily,
    deadline: objectRecord(payload.commitmentDeadline),
    participants,
    inputHints: resolutionInputHints(session, resolution)
  };
}

function resolutionOutcomes(resolution: PendingResolution): ResolutionOutcome[] {
  const declared = declaredResolutionOutcomes(resolution);
  if (declared.length > 0) {
    return declared;
  }
  if (resolution.mechanicFamily === "contest") {
    return [
      { id: "attacker-wins", label: "Attaquant gagne", description: "Valider la declaration de l'attaquant et appliquer les suites a la table." },
      { id: "defender-wins", label: "Defense gagne", description: "Rejeter la tentative et consigner la defense victorieuse." },
      { id: "tie-facilitator", label: "Egalite MJ", description: "Trancher manuellement une egalite ou une situation ambigue." }
    ];
  }
  if (resolution.mechanicFamily === "petition" || resolution.mechanicFamily === "vote") {
    return [
      { id: "accepted", label: "Acceptee", description: "La demande passe et ses effets peuvent etre appliques." },
      { id: "rejected", label: "Rejetee", description: "La demande echoue sans effet direct." },
      { id: "deferred", label: "Reportee", description: "La demande reste fictionnellement en suspens pour une phase ulterieure." }
    ];
  }
  if (resolution.type === "periodicDamageCheck") {
    return [
      { id: "no-effect", label: "Sans effet", description: "Le risque ne produit aucun changement cette fois." },
      { id: "damage-applied", label: "Degat applique", description: "Le MJ applique ou confirme le degat lie a la zone." }
    ];
  }
  return [{ id: "facilitator-resolved", label: "Resolue", description: "Marquer comme traite par le MJ." }];
}

function resolutionSummary(session: Session, resolution: PendingResolution): string {
  const actor = participantName(session, resolution.participantId) ?? "Table";
  const payload = resolution.payload ?? {};
  if (resolution.mechanicId === "minister-council-record") {
    const attendees = participantNames(session, objectRecord(payload)?.attendeeIds);
    const decisions = objectRecord(payload)?.decisions;
    return attendees.length > 0
      ? `${actor}: conseil avec ${attendees.join(", ")}`
      : `${actor}: conseil des ministres${typeof decisions === "string" ? ` - ${decisions}` : ""}`;
  }
  if (resolution.mechanicId === "contested-coup") {
    const defenderId = objectRecord(payload)?.defenderId;
    const defender = defenderId ? participantName(session, String(defenderId)) ?? String(defenderId) : "defenseur a preciser";
    const leaders = participantNames(session, objectRecord(payload)?.leaderIds);
    return `${actor}: coup contre ${defender}${leaders.length ? `, leaders ${leaders.join(", ")}` : ""}`;
  }
  if (typeof payload.petitionText === "string") {
    return `${actor}: ${payload.petitionText}`;
  }
  if (Array.isArray(payload.leaderIds)) {
    return `${actor}: leaders ${payload.leaderIds.join(", ")}`;
  }
  if (resolution.zoneId) {
    return `${actor}: zone ${resolution.zoneId}`;
  }
  return actor;
}

function enrichResolution(session: Session, resolution: PendingResolution): PendingResolution & {
  participantName?: string;
  summary: string;
  phaseResolution: PhaseResolutionView;
  recommendedOutcomes: ResolutionOutcome[];
  automaticEffects: ResolutionEffect[];
} {
  return {
    ...resolution,
    participantName: participantName(session, resolution.participantId),
    summary: resolutionSummary(session, resolution),
    phaseResolution: phaseResolutionView(session, resolution),
    recommendedOutcomes: resolutionOutcomes(resolution),
    automaticEffects: [...defaultResolutionEffects(resolution), ...liveAdministrationPayloadEffects(resolution)]
  };
}

function participantResolutionView(session: Session, resolution: PendingResolution, participant: Participant): ReturnType<typeof enrichResolution> {
  const enriched = enrichResolution(session, resolution);
  if (resolution.mechanicId !== "contested-coup") {
    return enriched;
  }

  const payload = objectRecord(enriched.payload) ?? {};
  const commitments = objectRecord(payload.commitments) ?? {};
  const attacker = objectRecord(commitments.attacker);
  const defender = objectRecord(commitments.defender);
  const visibleCommitments: Record<string, unknown> = {};
  if (attacker?.participantId === participant.id) {
    visibleCommitments.attacker = attacker;
  }
  if (defender?.participantId === participant.id) {
    visibleCommitments.defender = defender;
  }

  return {
    ...enriched,
    payload: {
      ...payload,
      commitments: Object.keys(visibleCommitments).length > 0 ? visibleCommitments : undefined,
      commitmentStatus: {
        attacker: attacker ? "recorded" : "waiting",
        defender: defender ? "recorded" : "waiting",
        viewerCanRespond: payload.defenderId === participant.id && !defender
      }
    }
  };
}

function dashboardReadModel(session: Session): ReturnType<typeof visibleSession> & {
  readModel: "dashboard";
  aggregates: Record<string, unknown>;
  scores: Record<string, unknown>[];
  rulesReference: Record<string, unknown>;
  characterReference: Record<string, unknown>;
} {
  const module = getModuleOrThrow(session.moduleId);
  return {
    ...visibleSession(session),
    aggregates: aggregateSession(session),
    scores: scoreParticipants(session),
    messages: session.messages,
    pendingResolutions: session.pendingResolutions.map((resolution) => enrichResolution(session, resolution)),
    rulesReference: rulesReference(module, "dashboard"),
    characterReference: characterReference(module, undefined, true),
    readModel: "dashboard"
  };
}

function participantReadModel(session: Session, participantId: string): Record<string, unknown> | undefined {
  const participant = session.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    return undefined;
  }

  const module = getModuleOrThrow(session.moduleId);
  const ownRole = participant.roleId ? module.roles.find((role) => role.id === participant.roleId) : undefined;
  const visiblePendingResolutions = session.pendingResolutions.filter((resolution) => {
    if (resolution.participantId === participant.id) return true;
    const payload = objectRecord(resolution.payload);
    if (resolution.mechanicId === "contested-coup") return true;
    if (payload?.defenderId === participant.id) return true;
    return Array.isArray(payload?.leaderIds) && payload.leaderIds.includes(participant.id);
  });
  return {
    code: session.code,
    module: {
      id: module.id,
      name: module.name,
      uiTheme: module.uiTheme,
      soundboard: module.soundboard.filter((cue) => cue.visibility === "participants" || cue.visibility === "all"),
      resources: module.resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        visibility: resource.visibility
      })),
      roles: module.roles.map((role) => ({
        id: role.id,
        name: role.name,
        officialRole: role.officialRole
      }))
    },
    rulesReference: rulesReference(module, "participants", participant),
    characterReference: characterReference(module, participant),
    phase: currentPhase(session),
    phaseClock: session.phaseClock,
    turnPhase: turnPhaseView(session),
    phasePlan: phasePlanView(session, participant),
    tableStatuses: session.statuses,
    participant,
    ownRole,
    availableActions: actionAvailability(session, participant).filter((action) => action.available),
    pendingResolutions: visiblePendingResolutions.map((resolution) => participantResolutionView(session, resolution, participant)),
    exchanges: session.exchanges.filter((exchange) => exchange.fromParticipantId === participant.id || exchange.toParticipantId === participant.id),
    messages: visibleMessagesForParticipant(session, participant.id),
    visibleParticipants: session.participants.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      name: candidate.name,
      roleId: candidate.id === participant.id ? candidate.roleId : undefined
    }))
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

function createSessionInstance(module: GameModule): Session {
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
    statuses: { ...module.state },
    sessionRoleAssignments: defaultSessionRoleAssignments(module),
    componentPools: defaultComponentPools(module),
    pendingResolutions: [],
    exchanges: [],
    messages: [],
    nextAuditSequence: 1,
    audit: []
  };

  audit(session, "session.created", { moduleId: module.id, phaseId: module.phases[0].id });
  sessions.set(code, session);
  return session;
}

function addDemoParticipant(
  session: Session,
  module: GameModule,
  player: { name: string; roleId: string; sessionRoleId?: string }
): { participant: Participant; device: Device } {
  const participant = createParticipant(module, { name: player.name, kind: "person", roleId: player.roleId });
  const device: Device = {
    id: crypto.randomUUID(),
    name: `Telephone ${player.name}`,
    participantId: participant.id,
    connected: true,
    lastSeenAt: new Date().toISOString()
  };
  session.participants.push(participant);
  session.devices.push(device);
  audit(session, "device.registered", { deviceId: device.id, name: device.name });
  audit(session, "participant.created", { participantId: participant.id, kind: participant.kind, name: participant.name });
  audit(session, "participant.bound_to_device", { participantId: participant.id, deviceId: device.id });

  if (player.sessionRoleId) {
    assertSessionRoleAssignment(module, session, player.sessionRoleId, participant.id);
    session.sessionRoleAssignments[player.sessionRoleId] = {
      sessionRoleId: player.sessionRoleId,
      participantId: participant.id,
      enabled: true,
      assignedAt: new Date().toISOString()
    };
    audit(session, "session_role.assigned", { sessionRoleId: player.sessionRoleId, participantId: participant.id });
  }

  return { participant, device };
}

function createPutschDemoSession(): Session {
  const module = getModuleOrThrow("putsch-lite");
  const session = createSessionInstance(module);
  const players = [
    { name: "Le Roi", roleId: "facilitator-capitalist", sessionRoleId: "game-authority" },
    { name: "James", roleId: "kgb-agent" },
    { name: "Giani", roleId: "cia-agent" },
    { name: "Raul", roleId: "fun-agent" },
    { name: "Miltos", roleId: "gag-agent" }
  ];
  for (const player of players) {
    addDemoParticipant(session, module, player);
  }
  const setupResult = runSetupDistribution(session);
  audit(session, "setup.distributed", setupResult);
  const message = createSessionMessage(session, { target: "allParticipants", channel: "demo", text: "Le marche ouvre." });
  audit(session, "message.sent", { message });
  return session;
}

function renderIndex(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ludovive Demo</title>
  <style>
    :root { color-scheme: dark; --bg: #101214; --panel: #181b1f; --surface: #111417; --field: #0d0f11; --line: #343a42; --ink: #f2f4f5; --muted: #aab2bb; --accent: #b94b42; --blue: #315875; --green: #3f6b4d; --warning: #b88a3b; --radius: 8px; --shadow: 0 18px 55px rgba(0,0,0,.32); --font-body: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; --font-display: var(--font-body); --font-numeric: ui-monospace, "SFMono-Regular", Consolas, monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--font-body); background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent 34rem),
      radial-gradient(circle at 82% 2%, color-mix(in srgb, var(--blue) 16%, transparent), transparent 30rem),
      linear-gradient(180deg, color-mix(in srgb, var(--bg) 88%, black), var(--bg)); color: var(--ink); }
    body:before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .18; background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(to bottom, black, transparent 72%); }
    main { position: relative; width: min(1460px, 100%); margin: 0 auto; padding: 20px; }
    h1 { margin: 0; font-family: var(--font-display); font-size: 30px; font-weight: 800; letter-spacing: 0; }
    h2 { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 12px; font-family: var(--font-display); font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: color-mix(in srgb, var(--ink) 78%, var(--muted)); }
    h2:after { content: ""; height: 1px; flex: 1; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, var(--line)), transparent); }
    h3 { margin: 14px 0 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
    section { border: 1px solid color-mix(in srgb, var(--line) 82%, white); border-radius: var(--radius); padding: 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 94%, white), color-mix(in srgb, var(--panel) 92%, black)); min-width: 0; box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, var(--shadow); }
    label { display: block; margin: 8px 0 4px; color: var(--muted); font-size: 13px; }
    input, select, button, textarea { font: inherit; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--line) 82%, white); padding: 9px; }
    input, select, textarea { width: 100%; background: color-mix(in srgb, var(--field) 90%, black); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset; }
    input:focus, select:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: 1px; }
    textarea { min-height: 72px; resize: vertical; }
    button { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 86%, white), color-mix(in srgb, var(--accent) 86%, black)); color: white; cursor: pointer; margin-top: 10px; min-height: 40px; font-weight: 800; border-color: color-mix(in srgb, var(--accent) 70%, white); box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 10px 22px rgba(0,0,0,.22); }
    button:hover { transform: translateY(-1px); filter: brightness(1.04); }
    button.secondary { background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 84%, white), var(--blue)); border-color: color-mix(in srgb, var(--blue) 70%, white); }
    button.neutral { background: linear-gradient(180deg, #3a414a, #272c32); border-color: #565f69; }
    button.success { background: linear-gradient(180deg, color-mix(in srgb, var(--green) 84%, white), var(--green)); border-color: color-mix(in srgb, var(--green) 70%, white); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; padding: 14px; border: 1px solid color-mix(in srgb, var(--line) 75%, white); border-radius: var(--radius); background: linear-gradient(135deg, color-mix(in srgb, var(--panel) 84%, var(--accent)), color-mix(in srgb, var(--panel) 92%, black)); box-shadow: var(--shadow); }
    .layout { display: grid; grid-template-columns: 340px 1fr; gap: 18px; align-items: start; }
    .stack { display: grid; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .tabButton { width: auto; min-height: 34px; margin: 0; padding: 7px 10px; background: linear-gradient(180deg, #3a414a, #272c32); border-color: #565f69; }
    .tabButton.active { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 86%, white), color-mix(in srgb, var(--accent) 86%, black)); border-color: color-mix(in srgb, var(--accent) 70%, white); }
    .tabPanel.hidden { display: none; }
    .brandLine { display: flex; align-items: center; gap: 10px; }
    .brandMark { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 82%, white), color-mix(in srgb, var(--accent) 76%, black)); color: white; font-weight: 900; letter-spacing: .05em; box-shadow: 0 12px 24px rgba(0,0,0,.24); }
    .pill { display: inline-block; padding: 5px 9px; border: 1px solid color-mix(in srgb, var(--line) 80%, white); border-radius: 999px; margin: 2px; font-size: 12px; color: color-mix(in srgb, var(--ink) 90%, var(--muted)); background: color-mix(in srgb, var(--surface) 78%, transparent); }
    .muted { color: var(--muted); }
    .list { display: grid; gap: 8px; }
    .list label input[type="checkbox"] { width: auto; margin-right: 6px; }
    .item { border: 1px solid color-mix(in srgb, var(--line) 76%, white); border-radius: var(--radius); padding: 11px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 93%, white), color-mix(in srgb, var(--surface) 94%, black)); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset; }
    .item strong { display: block; margin-bottom: 4px; }
    .ergoNowBoard { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .statTile { border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); border-radius: 8px; padding: 12px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), color-mix(in srgb, var(--surface) 92%, black)); }
    .statTile strong { font-size: 26px; line-height: 1; }
    .resourceWallet { display: grid; grid-template-columns: repeat(auto-fit, minmax(108px, 1fr)); gap: 8px; margin-top: 8px; }
    .resourceChip { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 8px; border: 1px solid color-mix(in srgb, var(--line) 78%, white); border-radius: var(--radius); padding: 8px; min-width: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--field) 92%, white), var(--field)); }
    .resourceChip .resourceValue { font-family: var(--font-numeric); font-size: 20px; font-weight: 700; line-height: 1; }
    .resourceChip .resourceName { color: var(--muted); font-size: 12px; line-height: 1.2; overflow-wrap: anywhere; }
    .actionHeader { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .actionHeader strong { margin: 0; }
    .actionMeta { flex: 0 0 auto; color: var(--muted); font-size: 11px; border: 1px solid #59616b; border-radius: 999px; padding: 4px 7px; text-transform: uppercase; letter-spacing: .04em; }
    .themeBanner { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel)); }
    .turnPhase { display: grid; gap: 6px; border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
    .turnPhaseHeader { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .turnPhaseName { font-size: 18px; font-weight: 700; }
    .phaseTrack { display: grid; grid-template-columns: repeat(var(--phase-total, 1), minmax(0, 1fr)); gap: 4px; }
    .phaseStep { height: 7px; border-radius: 999px; background: #30363d; }
    .phaseStep.active { background: var(--accent); }
    .timerGauge { height: 8px; border-radius: 999px; background: #30363d; overflow: hidden; }
    .timerGauge span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--warning)); }
    .gestureCard { display: grid; grid-template-columns: 96px 1fr; gap: 11px; align-items: center; border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); border-radius: var(--radius); margin-top: 9px; padding: 9px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--surface)), color-mix(in srgb, var(--surface) 92%, black)); }
    .gestureTitle { font-weight: 700; }
    .gestureTag { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .gestureArt { position: relative; height: 62px; border-radius: 8px; background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 62%), color-mix(in srgb, var(--field) 72%, var(--accent)); overflow: hidden; }
    .phone { position: absolute; width: 24px; height: 42px; border: 2px solid var(--ink); border-radius: 6px; background: #0b0d0f; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
    .phone:after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 3px; height: 2px; border-radius: 999px; background: var(--muted); }
    .phoneA { left: 17px; top: 8px; transform: rotate(-8deg); }
    .phoneB { right: 17px; top: 8px; transform: rotate(8deg); }
    .motion { position: absolute; width: 9px; height: 9px; border-radius: 999px; border: 2px solid var(--warning); opacity: .9; }
    .m1 { left: 43px; top: 16px; } .m2 { left: 54px; top: 27px; } .m3 { left: 64px; top: 38px; }
    .gesture-pour-liquid .phoneA { transform: rotate(-36deg); top: 2px; }
    .gesture-touch-phones .phoneA { left: 28px; transform: rotate(0deg); } .gesture-touch-phones .phoneB { right: 28px; transform: rotate(0deg); }
    .gesture-strike-phone .phoneA { transform: rotate(-42deg); left: 20px; top: 4px; } .gesture-strike-phone .phoneB { transform: rotate(48deg); right: 20px; top: 11px; }
    .gesture-parry-phone .phoneA { transform: rotate(52deg); left: 22px; } .gesture-parry-phone .phoneB { transform: rotate(-52deg); right: 22px; }
    .gesture-ballot-drop .phoneA { transform: rotate(90deg); top: 14px; left: 34px; } .gesture-ballot-drop .phoneB { opacity: .25; }
    .gesture-palm-cover .phoneA { left: 34px; } .gesture-palm-cover .phoneB { width: 40px; height: 22px; right: 18px; top: 18px; border-radius: 999px; opacity: .55; }
    .gestureCue { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 999px; margin-top: 8px; color: var(--ink); background: color-mix(in srgb, var(--accent) 15%, transparent); font-size: 12px; }
    .fallbackCue { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .action-contest { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
    .action-vote { border-color: color-mix(in srgb, var(--warning) 60%, var(--line)); }
    .resourcePushGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; margin-top: 8px; }
    .resourcePushTile { border: 1px solid #3c454f; border-radius: 8px; padding: 8px; background: #111417; }
    .resourcePushTile strong { display: flex; align-items: center; gap: 6px; min-height: 34px; font-size: 13px; }
    .resourceIcon, .actionIcon { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 7px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 34%, #0d0f11), color-mix(in srgb, var(--field) 92%, black)); color: var(--ink); font-weight: 900; font-size: 10px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); box-shadow: 0 1px 0 rgba(255,255,255,.06) inset; overflow: hidden; }
    .resourceIcon img, .actionIcon img { width: 22px; height: 22px; display: block; object-fit: contain; }
    .roleTitle, .turnPhaseName { display: flex; align-items: center; gap: 8px; }
    .soundCueButton { width: auto; min-height: 30px; margin: 5px 5px 0 0; padding: 5px 8px; font-size: 12px; }
    .resourcePushControls { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
    .resourcePushControls button { min-height: 34px; margin: 0; padding: 6px; }
    .contactTarget { display: block; border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 8px; padding: 9px; margin: 8px 0; background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .contactTarget input[type="checkbox"] { width: auto; margin-right: 6px; }
    .networkUrl { display: grid; gap: 3px; border: 1px solid #3c454f; border-radius: var(--radius); padding: 8px; background: var(--field); overflow-wrap: anywhere; }
    .networkUrl a { color: var(--ink); font-weight: 700; }
    pre { white-space: pre-wrap; background: #0d0f11; padding: 12px; border-radius: 6px; overflow: auto; max-height: 420px; }
    details.debug { border: 1px solid var(--line); border-radius: 8px; background: #111417; padding: 10px; }
    details.debug summary { cursor: pointer; color: var(--muted); }
    .error { color: #ffb1a8; min-height: 20px; }
    @media (max-width: 900px) { main { padding: 12px; } .layout { grid-template-columns: 1fr; } .topbar { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div>
        <div class="brandLine"><span class="brandMark">LV</span><div><h1>Ludovive</h1><div class="muted">Interface de jeu live</div></div></div>
      </div>
      <div>
        <a href="/play" id="participantLink" class="pill">App participant</a>
        <span id="summary"></span>
      </div>
    </div>

    <div class="layout">
      <div class="stack">
        <section>
          <h2>1. Choix du jeu</h2>
        <label for="module">Jeu a lancer</label>
        <select id="module"></select>
        <div id="currentGame" class="muted">Aucune session chargee.</div>
        <div class="muted">Le jeu est choisi une seule fois avant la creation de session. Ensuite les telephones rejoignent la salle d'attente.</div>
          <div class="actions">
            <button id="create">Creer session vide</button>
            <button id="seed" class="success">Demo Banana Republic</button>
            <button id="newSession" class="neutral">Preparer une autre session</button>
            <button id="refresh" class="secondary">Rafraichir</button>
          </div>
        <label for="code">Code session</label>
        <input id="code" placeholder="ABC123" />
          <button id="copyParticipantLink" class="neutral">Copier lien participant</button>
          <div class="error" id="error"></div>
        </section>

        <section>
          <h2>Acces Wi-Fi</h2>
          <div id="networkPanel" class="list"><div class="muted">Detection reseau...</div></div>
        </section>

        <section>
          <h2>Poste de conduite</h2>
          <div id="themePanel" class="list"></div>
          <div id="mvpPanel" class="list"></div>
        </section>

        <section>
          <h2>2. Salle d'attente & affectation</h2>
          <label for="participantName">Nom affiche</label>
          <input id="participantName" placeholder="Ana" />
          <button id="createParticipant">Ajouter sans telephone</button>

          <label for="deviceName">Appareil a enregistrer</label>
          <input id="deviceName" placeholder="Telephone Ana" />
          <button id="createDevice" class="secondary">Enregistrer appareil</button>

          <label for="bindDeviceId">Appareil a lier</label>
          <select id="bindDeviceId"></select>
          <label for="bindParticipantId">Joueur ou poste</label>
          <select id="bindParticipantId"></select>
          <button id="bind" class="secondary">Lier</button>
        </section>

        <section>
          <h2>Controles de jeu</h2>
          <div id="gameControls" class="list"></div>
        </section>

        <section>
          <h2>Facilitateur</h2>
          <label for="messageTarget">Cible</label>
          <select id="messageTarget"></select>
          <label for="messageText">Message</label>
          <textarea id="messageText">Le marche ouvre.</textarea>
          <button id="sendMessage">Envoyer</button>

          <h3>Changer le role de jeu</h3>
          <label for="roleParticipant">Joueur ou poste</label>
          <select id="roleParticipant"></select>
          <label for="assignRoleId">Nouveau role de jeu</label>
          <select id="assignRoleId"></select>
          <button id="assignRole" class="secondary">Attribuer ce role</button>

          <h3>Responsabilite d'animation</h3>
          <label for="sessionRoleId">Responsabilite</label>
          <select id="sessionRoleId"></select>
          <label for="sessionRoleParticipant">Porteur</label>
          <select id="sessionRoleParticipant"></select>
          <button id="assignSessionRole" class="secondary">Attribuer responsabilite</button>
          <div id="sessionRoles" class="list"></div>
          <div id="injectionAuthorityNotice" class="muted"></div>

          <h3>Resolutions de phase</h3>
          <div id="phaseResolutions" class="list"></div>

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

          <h3>Temps</h3>
          <label for="phaseDuration">Duree phase (secondes)</label>
          <input id="phaseDuration" type="number" min="1" value="300" />
          <button id="setTimer" class="secondary">Regler minuteur</button>
          <label for="coupCommitmentDuration">Duree engagements coup d'Etat (secondes)</label>
          <input id="coupCommitmentDuration" type="number" min="1" value="120" />
          <button id="setCoupCommitmentDuration" class="secondary">Regler engagements</button>
          <button id="advance" class="secondary">Phase suivante</button>
        </section>
      </div>

      <div class="stack">
        <section>
          <h2>Reference</h2>
          <div class="tabs">
            <button class="tabButton active" data-dashboard-tab="table">Table</button>
            <button class="tabButton" data-dashboard-tab="rules">Regles</button>
            <button class="tabButton" data-dashboard-tab="characters">Personnages</button>
          </div>
          <div id="dashboardTabTable" class="tabPanel">
            <div class="muted">Vue operationnelle ci-dessous.</div>
          </div>
          <div id="dashboardTabRules" class="tabPanel hidden"></div>
          <div id="dashboardTabCharacters" class="tabPanel hidden"></div>
        </section>

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
            <div>
              <h3>Scores</h3>
              <div id="scores" class="list"></div>
            </div>
          </div>
        </section>

        <section>
          <h2>Suivi</h2>
          <div class="grid">
            <div>
              <h3>Agregats</h3>
              <div id="aggregates" class="list"></div>
            </div>
            <div>
              <h3>Messages</h3>
              <div id="messages" class="list"></div>
            </div>
            <div>
              <h3>Echanges</h3>
              <div id="exchangeLog" class="list"></div>
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

        <details class="debug">
          <summary>Debug JSON</summary>
          <pre id="state">Aucune session chargee.</pre>
        </details>
      </div>
    </div>
  </main>
  <script>
    let sessionCode = "";
    let currentSession;
    let liveSocket;
    function byId(id) { return document.querySelector("#" + id); }
    function setError(message) { byId("error").textContent = message || ""; }
    function option(value, label) { return '<option value="' + value + '">' + label + '</option>'; }
    function dashboardRoleLabel(session, roleId) {
      return session.module.roles.find((role) => role.id === roleId)?.name || roleId || "sans role";
    }
    function dashboardResourceLabel(session, resourceId) {
      return session.module.resources.find((resource) => resource.id === resourceId)?.name || resourceId;
    }
    function assetUrl(reference, kind) {
      if (!reference) return "";
      const folder = kind === "icon" ? "icons" : "sounds";
      const extension = kind === "icon" ? ".svg" : ".wav";
      if (reference.startsWith("/assets/" + folder + "/")) return reference;
      if (reference.startsWith(kind + ":")) {
        const name = reference.slice(kind.length + 1).replace(/[^a-z0-9-]/gi, "");
        return name ? "/assets/" + folder + "/" + name + extension : "";
      }
      return "";
    }
    function iconMarkup(value) {
      const url = assetUrl(value, "icon");
      return url ? '<img src="' + url + '" alt="" loading="lazy" />' : value;
    }
    function soundUrl(cue) {
      return assetUrl(cue?.url || "", "sound");
    }
    function dashboardResourceIcon(session, resourceId) {
      const themed = themeIcon(session, resourceId);
      if (themed) return iconMarkup(themed);
      const icons = {
        money: "$",
        copperShares: "Cu",
        weapons: "CF",
        ammo: "CM",
        influence: "!",
        drugBags: "D",
        voteBallots: "V",
        cf25: "25F",
        cf50: "50F",
        cf100: "100F",
        cm25: "25M",
        cm50: "50M",
        cm100: "100M",
        gold: "Au",
        income: "Inc",
        favor: "Fav",
        status: "Sta",
        hull: "Hull",
        oxygen: "O2",
        battery: "Bat",
        noise: "N",
        torpedoes: "Tor",
        intel: "Int"
      };
      return iconMarkup(icons[resourceId] || resourceId.slice(0, 2).toUpperCase());
    }
    function dashboardComponentLabel(session, componentId) {
      return (session.module.components || []).find((component) => component.id === componentId)?.name || componentId;
    }
    function applyTheme(theme) {
      const colors = theme?.colors || {};
      const fonts = theme?.fonts || {};
      const root = document.documentElement;
      const map = { background: "--bg", panel: "--panel", ink: "--ink", muted: "--muted", accent: "--accent", secondary: "--blue", success: "--green", warning: "--warning" };
      Object.entries(map).forEach(([key, cssVar]) => { if (colors[key]) root.style.setProperty(cssVar, colors[key]); });
      const fontMap = { body: "--font-body", display: "--font-display", numeric: "--font-numeric" };
      Object.entries(fontMap).forEach(([key, cssVar]) => { if (fonts[key]) root.style.setProperty(cssVar, fonts[key]); });
    }
    function themeIcon(session, key) {
      return (session.module.uiTheme?.icons || {})[key] || "";
    }
    function roleIcon(session, role) {
      return iconMarkup(themeIcon(session, "role:" + role.id) || themeIcon(session, role.id) || "ROLE");
    }
    function phaseIcon(session, phase) {
      return iconMarkup(themeIcon(session, "phase:" + phase.id) || themeIcon(session, phase.id) || themeIcon(session, "track") || "PH");
    }
    function actionIcon(session, action) {
      const key = action.mechanicFamily || action.id;
      const fallback = {
        exchange: "TR",
        contest: "ATK",
        vote: "VOT",
        petition: "PET",
        market: "MKT",
        "timed-income": "INC",
        "live-administration": "ADM",
        coordination: "CMD",
        "resource-action": "SYS"
      };
      const themed = themeIcon(session, "action:" + action.id) || themeIcon(session, key) || themeIcon(session, "role:" + action.actor);
      return iconMarkup(themed || fallback[key] || fallback[action.gesture] || "ACT");
    }
    function gestureMeta(gesture) {
      const gestures = {
        "touch-phones": { label: "Contact telephones", detail: "Les deux telephones se touchent avant validation.", proximity: "contact requis" },
        "pour-liquid": { label: "Verser", detail: "Incliner le telephone vers l'autre joueur pour pousser les ressources.", proximity: "telephones proches" },
        "shake-phones": { label: "Serrer", detail: "Mouvement bref de poignee de main avec les telephones.", proximity: "meme table" },
        "tap-stack": { label: "Poser sur la pile", detail: "Toucher la zone ou la pile physique qui represente le marche.", proximity: "zone de table" },
        "palm-cover": { label: "Couvrir", detail: "Couvrir l'ecran pour une transaction discrete.", proximity: "a vue courte" },
        "ballot-drop": { label: "Deposer", detail: "Poser le telephone comme un bulletin dans l'urne.", proximity: "zone de vote" },
        "strike-phone": { label: "Frapper", detail: "Mouvement d'attaque court avec le telephone.", proximity: "duel proche" },
        "parry-phone": { label: "Parer", detail: "Presenter le telephone en parade pendant le compte a rebours.", proximity: "duel proche" },
        "hold-phone-up": { label: "Lever", detail: "Lever le telephone pour signaler un ordre.", proximity: "visible equipe" },
        "tilt-phone-forward": { label: "Incliner", detail: "Incliner vers l'avant pour engager une action de poste.", proximity: "poste de table" },
        "phone-face-down": { label: "Retourner", detail: "Retourner le telephone face contre table.", proximity: "poste de table" },
        "slow-phone-arc": { label: "Balayage", detail: "Tracer un arc lent pour une recherche ou un sonar.", proximity: "poste de table" },
        "slide-resource-to-edge": { label: "Pousser au bord", detail: "Faire glisser les jetons vers le bord de l'ecran.", proximity: "contact de table" }
      };
      return gestures[gesture] || { label: gesture, detail: "Geste declare par le module importe.", proximity: "selon module" };
    }
    function gestureArt(gesture) {
      const className = String(gesture || "generic").replace(/[^a-z0-9-]/g, "");
      return '<div class="gestureArt gesture-' + className + '"><span class="phone phoneA"></span><span class="phone phoneB"></span><span class="motion m1"></span><span class="motion m2"></span><span class="motion m3"></span></div>';
    }
    function renderGestureCard(session, action) {
      if (!action.gesture) return "";
      const meta = gestureMeta(action.gesture);
      const primary = session.module.uiTheme?.interactionLabels?.primary || "Geste";
      return '<div class="gestureCard">' + gestureArt(action.gesture) + '<div><div class="gestureTitle"><span class="actionIcon">' + actionIcon(session, action) + '</span> ' + primary + ': ' + (action.gestureLabel || meta.label) + '</div><div class="gestureTag">' + meta.proximity + '</div><div class="muted">' + meta.detail + '</div></div></div>';
    }
    function interactionCue(session, action) {
      const fallback = session.module.uiTheme?.interactionLabels?.fallback || "Bouton de secours";
      return renderGestureCard(session, action) + '<div class="fallbackCue">' + fallback + ': ' + (action.fallback || "confirmation manuelle") + '</div>';
    }
    function renderThemePanel(session) {
      const theme = session.module.uiTheme || {};
      const cues = (session.module.soundboard || []).map((cue) => {
        const play = soundUrl(cue) ? '<button type="button" class="secondary soundCueButton" data-sound-url="' + soundUrl(cue) + '">Ecouter</button>' : "";
        return '<div class="muted">' + cue.name + ' - ' + cue.channel + (cue.phase ? ' / phase ' + cue.phase : '') + (cue.event ? ' / ' + cue.event : '') + '</div>' + play;
      }).join("");
      return '<div class="item themeBanner"><strong><span class="actionIcon">' + iconMarkup(themeIcon(session, "game") || "LV") + '</span> Template ' + (theme.template || "tabletop") + '</strong><div>' + (theme.tone || "Style de table") + '</div><div class="muted">Couleurs, icones, sons et polices viennent du module importe.</div>' + cues + '</div>';
    }
    function formatTurnPhase(turnPhase, fallbackClock) {
      if (!turnPhase) return formatClock(fallbackClock);
      const end = turnPhase.endsAt ? new Date(turnPhase.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "fin libre";
      const duration = turnPhase.durationSeconds ? turnPhase.durationSeconds + "s" : "sans duree";
      return "Tour " + turnPhase.turn + " - Phase " + (turnPhase.phase.index + 1) + "/" + turnPhase.phase.total + " - " + duration + " - fin " + end;
    }
    function timerPercent(turnPhase) {
      if (!turnPhase?.endsAt || !turnPhase.durationSeconds) return 100;
      const remaining = Math.max(0, new Date(turnPhase.endsAt).getTime() - Date.now());
      return Math.max(0, Math.min(100, Math.round((remaining / (turnPhase.durationSeconds * 1000)) * 100)));
    }
    function renderTurnPhase(session) {
      const turnPhase = session.turnPhase;
      if (!turnPhase) {
        return '<div class="item turnPhase"><strong><span class="actionIcon">' + phaseIcon(session, session.phase) + '</span> ' + session.module.name + '</strong><div>Phase: ' + session.phase.name + '</div><div class="muted">' + formatClock(session.phaseClock) + '</div></div>';
      }
      const steps = Array.from({ length: turnPhase.phase.total }, (_, index) => '<span class="phaseStep' + (index === turnPhase.phase.index ? " active" : "") + '"></span>').join("");
      return '<div class="item turnPhase"><div class="turnPhaseHeader"><span class="pill">Tour ' + turnPhase.turn + '</span><span class="pill">Phase ' + (turnPhase.phase.index + 1) + '/' + turnPhase.phase.total + '</span></div><div class="turnPhaseName"><span class="actionIcon">' + phaseIcon(session, turnPhase.phase) + '</span> ' + turnPhase.phase.name + '</div><div class="phaseTrack" style="--phase-total:' + turnPhase.phase.total + '">' + steps + '</div><div class="timerGauge"><span style="width:' + timerPercent(turnPhase) + '%"></span></div><div class="muted">' + formatTurnPhase(turnPhase, session.phaseClock) + '</div></div>';
    }
    function renderPhasePlanSummary(session) {
      const plan = session.phasePlan;
      if (!plan) return "";
      const controls = plan.actions.filter((action) => action.mode === "control").length;
      const resolutions = plan.actions.filter((action) => action.mode === "resolution").length;
      const next = plan.nextPhase.startsNextTurn ? "Tour suivant: " : "Puis: ";
      return '<div class="item"><strong>Plan de phase</strong><div>' + plan.playableActionCount + ' action(s), ' + controls + ' controle(s), ' + resolutions + ' resolution(s)</div><div class="muted">' + plan.pendingResolutionCount + ' resolution(s) en attente</div><div class="muted">' + next + plan.nextPhase.name + '</div></div>';
    }
    function formatStatusValue(value) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
      return JSON.stringify(value);
    }
    function renderStatusList(statuses) {
      const entries = Object.entries(statuses || {});
      return entries.map(([key, value]) => '<span class="pill">' + key + ': ' + formatStatusValue(value) + '</span>').join("") || '<span class="muted">Aucun statut</span>';
    }
    function renderRulesReference(reference) {
      if (!reference) return '<div class="muted">Aucune regle resumee</div>';
      const summary = reference.summary ? '<div class="item"><strong>Resume</strong><div>' + reference.summary + '</div></div>' : "";
      const sections = (reference.sections || []).map((section) => {
        const body = section.body ? '<div>' + section.body + '</div>' : "";
        const bullets = (section.bullets || []).length ? '<ul>' + section.bullets.map((bullet) => '<li>' + bullet + '</li>').join("") + '</ul>' : "";
        return '<div class="item"><strong>' + section.title + '</strong>' + body + bullets + '</div>';
      }).join("");
      return '<div class="list">' + summary + sections + '</div>';
    }
    function renderRoleSheetBlock(title, value) {
      return value ? '<h3>' + title + '</h3><div>' + value + '</div>' : "";
    }
    function renderRoleSheetList(title, values) {
      return (values || []).length ? '<h3>' + title + '</h3><ul>' + values.map((item) => '<li>' + item + '</li>').join("") + '</ul>' : "";
    }
    function renderRoleSheet(role) {
      const sheet = role.roleSheet || {};
      const phaseFocus = (sheet.phaseFocus || []).length
        ? '<h3>Par phase</h3>' + sheet.phaseFocus.map((focus) => '<div class="item"><strong>' + (focus.title || focus.phase || "Phase") + '</strong><ul>' + (focus.bullets || []).map((item) => '<li>' + item + '</li>').join("") + '</ul></div>').join("")
        : "";
      return renderRoleSheetBlock("Univers", sheet.universe)
        + renderRoleSheetBlock("Qui vous etes", sheet.identity)
        + renderRoleSheetBlock("Facade publique", sheet.publicFace)
        + renderRoleSheetBlock("Brief secret", sheet.secretBriefing)
        + renderRoleSheetBlock("Objectif", sheet.objective)
        + renderRoleSheetBlock("Comment gagner", sheet.howToWin)
        + renderRoleSheetBlock("Comment jouer", sheet.howToPlay)
        + renderRoleSheetList("Premiers gestes", sheet.firstMoves)
        + renderRoleSheetList("Regles clefs", sheet.keyRules)
        + phaseFocus
        + renderRoleSheetList("Accroches de negociation", sheet.negotiationHooks)
        + renderRoleSheetList("Risques", sheet.risks)
        + renderRoleSheetList("Rappels", sheet.reminders);
    }
    function renderCharacterCard(session, role) {
      if (!role) return "";
      const responsibilities = (role.responsibilities || []).length ? '<h3>Responsabilites</h3><ul>' + role.responsibilities.map((item) => '<li>' + item + '</li>').join("") + '</ul>' : "";
      const actions = (role.actions || []).length ? '<h3>Actions</h3><div>' + role.actions.map((item) => '<span class="pill">' + item + '</span>').join("") + '</div>' : "";
      const resources = role.startingResources && Object.keys(role.startingResources).length ? '<h3>Depart</h3><div>' + Object.entries(role.startingResources).map(([key, value]) => '<span class="pill">' + dashboardResourceLabel(session, key) + ': ' + value + '</span>').join("") + '</div>' : "";
      const victory = role.victoryCondition?.text ? '<h3>Victoire</h3><div class="muted">' + role.victoryCondition.text + '</div>' : "";
      return '<div class="item"><strong class="roleTitle"><span class="actionIcon">' + roleIcon(session, role) + '</span> ' + role.name + '</strong>' + (role.officialRole ? '<div>' + role.officialRole + '</div>' : '') + (role.secretRole ? '<div class="muted">Secret: ' + role.secretRole + '</div>' : '') + renderRoleSheet(role) + responsibilities + actions + resources + victory + '</div>';
    }
    function renderDashboardCharacters(session) {
      const roles = session.characterReference?.roles || [];
      return '<div class="list">' + (roles.map((role) => renderCharacterCard(session, role)).join("") || '<div class="muted">Aucun personnage</div>') + '</div>';
    }
    function setDashboardTab(name) {
      ["table", "rules", "characters"].forEach((tab) => {
        document.querySelector('[data-dashboard-tab="' + tab + '"]')?.classList.toggle("active", tab === name);
        byId("dashboardTab" + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.toggle("hidden", tab !== name);
      });
    }
    function dashboardParticipantOptions(session) {
      return option("", "Cible liee") + session.participants.map((participant) => option(participant.id, participant.name)).join("");
    }
    function dashboardResourceOptions(session) {
      return session.module.resources.map((resource) => option(resource.id, resource.name)).join("");
    }
    function dashboardParticipantName(session, participantId) {
      return session.participants.find((participant) => participant.id === participantId)?.name || "non assigne";
    }
    function hasDashboardInjectionAuthority(session) {
      const injectionRoles = (session.module.sessionRoles || []).filter((sessionRole) => sessionRole.canInjectGameElements);
      if (!injectionRoles.length) return true;
      const assignments = session.sessionRoleAssignments || {};
      return injectionRoles.some((sessionRole) => {
        const assignment = assignments[sessionRole.id];
        return Boolean(assignment && assignment.enabled && assignment.participantId);
      });
    }
    function updateInjectionControls(session) {
      const hasAuthority = hasDashboardInjectionAuthority(session);
      const needsAuthority = (session.module.sessionRoles || []).some((sessionRole) => sessionRole.canInjectGameElements);
      byId("injectionAuthorityNotice").textContent = needsAuthority && !hasAuthority
        ? "Assignez une responsabilite d'injection avant de corriger ou arbitrer."
        : "";
      byId("setResource").disabled = !hasAuthority;
      document.querySelectorAll(".resolveResolution").forEach((button) => {
        button.disabled = !hasAuthority;
        button.title = hasAuthority ? "" : "Responsabilite d'injection requise";
      });
      document.querySelectorAll(".recordPhaseResolution").forEach((button) => {
        button.disabled = !hasAuthority;
        button.title = hasAuthority ? "" : "Responsabilite d'injection requise";
      });
    }
    function renderSessionRoles(session) {
      const assignments = session.sessionRoleAssignments || {};
      return (session.module.sessionRoles || []).map((sessionRole) => {
        const assignment = assignments[sessionRole.id] || {};
        const holder = assignment.participantId ? dashboardParticipantName(session, assignment.participantId) : "non assigne";
        const inject = sessionRole.canInjectGameElements ? "injection autorisee" : "pas d'injection";
        const state = assignment.enabled === false ? "desactivee" : "active";
        return '<div class="item"><strong>' + sessionRole.name + '</strong><div>' + holder + '</div><div class="muted">' + state + ' - ' + inject + '</div></div>';
      }).join("") || '<div class="muted">Aucune casquette declaree</div>';
    }
    function dashboardResolutionEffectLabel(session, effect) {
      if (!effect) return "";
      const target = effect.participantId ? (session.participants.find((participant) => participant.id === effect.participantId)?.name || effect.participantId) + " - " : "";
      if (effect.type === "adjustResource") return target + dashboardResourceLabel(session, effect.resource) + " " + (effect.delta > 0 ? "+" : "") + effect.delta;
      if (effect.type === "setState") return target + effect.state + " = " + (effect.value === undefined ? "true" : effect.value);
      if (effect.type === "adjustSessionCounter") return effect.state + " " + (effect.delta > 0 ? "+" : "") + effect.delta;
      if (effect.type === "scaleSessionCounter") return effect.state + " x" + effect.factor;
      if (effect.type === "setSessionState") return effect.state + " = " + (effect.value === undefined ? "true" : effect.value);
      return target + effect.type;
    }
    function dashboardOutcomeDetails(session, outcome) {
      const effects = (outcome.effects || []).map((effect) => dashboardResolutionEffectLabel(session, effect)).filter(Boolean);
      if (!outcome.description && effects.length === 0) return "";
      return '<div class="muted" data-resolution-outcome-detail="' + outcome.id + '">' + [outcome.description, effects.length ? "Effets: " + effects.join(" / ") : ""].filter(Boolean).join(" - ") + '</div>';
    }
    function dashboardResourceBundleLabel(session, resources) {
      const entries = Object.entries(resources || {}).filter(([, value]) => Number(value) > 0);
      return entries.map(([key, value]) => dashboardResourceLabel(session, key) + ": " + value).join(" / ");
    }
    function dashboardParticipantNames(session, participantIds) {
      return Array.isArray(participantIds) ? participantIds.map((participantId) => dashboardParticipantName(session, participantId)).join(", ") : "";
    }
    function dashboardResolutionPayloadDetails(session, resolution) {
      const payload = resolution.payload || {};
      if (resolution.mechanicId === "contested-coup") {
        return [
          "Defenseur: " + (payload.defenderId ? dashboardParticipantName(session, payload.defenderId) : "a preciser"),
          payload.leaderIds ? "Leaders: " + dashboardParticipantNames(session, payload.leaderIds) : "",
          payload.resources ? "Engagement: " + dashboardResourceBundleLabel(session, payload.resources) : ""
        ].filter(Boolean).map((line) => '<div class="muted">' + line + '</div>').join("");
      }
      if (resolution.mechanicId === "minister-council-record") {
        return [
          payload.attendeeIds ? "Presents: " + dashboardParticipantNames(session, payload.attendeeIds) : "",
          payload.embezzlement ? "Detournement: " + dashboardResourceBundleLabel(session, payload.embezzlement) : "",
          payload.decisions ? "Decision: " + payload.decisions : ""
        ].filter(Boolean).map((line) => '<div class="muted">' + line + '</div>').join("");
      }
      return resolution.payload ? '<div class="muted">' + JSON.stringify(resolution.payload) + '</div>' : "";
    }
    function dashboardAutomaticEffectDetails(session, resolution) {
      const effects = (resolution.automaticEffects || []).map((effect) => dashboardResolutionEffectLabel(session, effect)).filter(Boolean);
      return effects.length ? '<div class="muted">Effets auto: ' + effects.join(" / ") + '</div>' : "";
    }
    function renderDashboardAggregates(session) {
      const aggregates = session.aggregates || {};
      const resourceRows = Object.entries(aggregates.resources || {}).map(([resourceId, stats]) => {
        const average = Number(stats.average || 0).toFixed(1);
        return '<div class="item"><strong>' + dashboardResourceLabel(session, resourceId) + '</strong><div>Total: ' + stats.total + '</div><div class="muted">min ' + stats.min + ' / max ' + stats.max + ' / moy. ' + average + '</div></div>';
      }).join("");
      const participants = aggregates.participants || {};
      const participantRow = '<div class="item"><strong>Participants</strong><div>Total: ' + (participants.total || 0) + '</div><div class="muted">Roles: ' + Object.entries(participants.byRole || {}).map(([roleId, count]) => dashboardRoleLabel(session, roleId) + " " + count).join(" / ") + '</div></div>';
      const inventoryRows = Object.entries(aggregates.inventory || {}).map(([componentId, count]) => '<div class="item"><strong>' + dashboardComponentLabel(session, componentId) + '</strong><div>En main: ' + count + '</div></div>').join("");
      const poolRows = Object.entries(aggregates.componentPools || {}).map(([componentId, pool]) => '<div class="item"><strong>' + dashboardComponentLabel(session, componentId) + '</strong><div>Restant: ' + pool.remaining + '</div><div class="muted">' + (pool.exhausted ? "epuise" : "disponible") + '</div></div>').join("");
      return [participantRow, resourceRows, inventoryRows, poolRows].filter(Boolean).join("") || '<div class="muted">Aucun agregat</div>';
    }
    function renderDashboardScores(session) {
      const scores = session.scores || [];
      return scores.map((score, index) => {
        const details = (score.breakdown || []).map((entry) => dashboardResourceLabel(session, entry.resourceId) + ": " + Math.round(entry.points)).join(" / ");
        return '<div class="item"><strong>#' + (index + 1) + ' ' + score.name + '</strong><div>' + Math.round(score.total) + ' point(s)</div><div class="muted">' + (score.roleName || dashboardRoleLabel(session, score.roleId)) + '</div><div class="muted">' + details + '</div></div>';
      }).join("") || '<div class="muted">Aucun score declare pour ce module</div>';
    }
    function dashboardResourceChip(session, resourceId, value) {
      return '<div class="resourceChip"><span class="resourceIcon">' + dashboardResourceIcon(session, resourceId) + '</span><div><div class="resourceValue">' + value + '</div><div class="resourceName">' + dashboardResourceLabel(session, resourceId) + '</div></div></div>';
    }
    function renderDashboardResourceWallet(session, resources) {
      const entries = Object.entries(resources || {}).filter(([, value]) => Number(value) !== 0);
      return entries.length ? '<div class="resourceWallet">' + entries.map(([key, value]) => dashboardResourceChip(session, key, value)).join("") + '</div>' : '<div class="muted">Aucune ressource</div>';
    }
    function renderDashboardParticipants(session) {
      return session.participants.map((participant) => '<div class="item participantCard"><div class="actionHeader"><strong>' + participant.name + '</strong><span class="actionMeta">' + dashboardRoleLabel(session, participant.roleId) + '</span></div>' + renderDashboardResourceWallet(session, participant.resources) + '<div>' + renderStatusList(participant.statuses) + '</div></div>').join("") || '<div class="muted">Aucun participant</div>';
    }
    function renderMvpPanel(session) {
      const pendingCount = (session.pendingResolutions || []).length;
      const connectedCount = (session.devices || []).filter((device) => device.connected).length;
      const currentActions = (session.module.actions || []).filter((action) => action.phase === "*" || action.phase === session.phase.id);
      const nextStep = pendingCount > 0
        ? "Traiter " + pendingCount + " resolution(s)"
        : currentActions.length > 0
          ? "Phase active: " + currentActions.map((action) => action.name).join(" / ")
          : "Avancer la phase ou envoyer une consigne";
      return [
        renderTurnPhase(session),
        renderPhasePlanSummary(session),
        '<div class="ergoNowBoard"><div class="statTile"><strong>' + session.participants.length + '</strong><div class="muted">participants</div></div><div class="statTile"><strong>' + connectedCount + '/' + session.devices.length + '</strong><div class="muted">appareils connectes</div></div><div class="statTile"><strong>' + pendingCount + '</strong><div class="muted">resolutions</div></div></div>',
        '<div class="item"><strong>Etat de table</strong><div class="muted">' + renderStatusList(session.statuses) + '</div></div>',
        '<div class="item"><strong>A faire</strong><div>' + nextStep + '</div></div>'
      ].join("");
    }
    function dashboardResolutionClass(resolution) {
      if (resolution.mechanicId === "contested-coup") return " coupResolution";
      if (resolution.mechanicId === "minister-council-record") return " councilResolution";
      return "";
    }
    function dashboardActionInputLabel(input) {
      const labels = {
        toParticipantId: "Receveur",
        defenderId: "Cible",
        leaderIds: "Leaders",
        resources: "Ressources a pousser",
        attendeeIds: "Presents",
        embezzlement: "Detournement",
        decisions: "Decisions",
        promotionCandidateId: "Faire entrer au conseil",
        eliminationCandidateId: "Eliminer du conseil",
        votes: "Bulletins engages"
      };
      return input.label || input.name || labels[input.id] || input.id;
    }
    function dashboardActionParticipantOptions(session) {
      return session.participants
        .map((participant) => option(participant.id, participant.name + (participant.roleId ? " (" + dashboardRoleLabel(session, participant.roleId) + ")" : "")))
        .join("");
    }
    function dashboardActionInputControl(session, input) {
      if (!input || !input.id || input.source === "actor-or-bound-device") return "";
      if (input.type === "session-state") return "";
      const label = dashboardActionInputLabel(input);
      if (input.type === "text") {
        return '<label>' + label + '</label><textarea data-live-input="' + input.id + '" placeholder="' + label + '"></textarea>';
      }
      if (input.type === "number") {
        return '<label>' + label + '</label><input type="number" min="1" value="1" data-live-input="' + input.id + '" />';
      }
      if (input.type === "enum") {
        const choices = Array.isArray(input.choices) ? input.choices : [];
        return '<label>' + label + '</label><select data-live-input="' + input.id + '">' + choices.map((choice) => option(String(choice), String(choice))).join("") + '</select>';
      }
      if (input.type === "participant") {
        return '<label>' + label + '</label><select data-live-input="' + input.id + '">' + dashboardActionParticipantOptions(session) + '</select>';
      }
      if (input.type === "participant-list") {
        if (input.count) {
          return Array.from({ length: Number(input.count) }, (_, index) => '<label>' + label + ' ' + (index + 1) + '</label><select data-live-input="' + input.id + '" data-list-index="' + index + '">' + dashboardActionParticipantOptions(session) + '</select>').join("");
        }
        return '<label>' + label + '</label><div class="list">' + session.participants.map((participant) => '<label><input type="checkbox" data-live-input="' + input.id + '" data-list-multi="true" value="' + participant.id + '" /> ' + participant.name + '</label>').join("") + '</div>';
      }
      if (input.type === "resource-bundle") {
        const resources = input.allowed || session.module.resources.map((resource) => resource.id);
        return '<div class="fallbackCue">Secours dashboard: a la table, le joueur pousse les jetons depuis son telephone.</div><div class="resourcePushGrid">' + resources.map((resourceId) => '<div class="resourcePushTile"><strong><span class="resourceIcon">' + dashboardResourceIcon(session, resourceId) + '</span>' + dashboardResourceLabel(session, resourceId) + '</strong><label>Quantite</label><input type="number" min="0" value="0" data-live-input="' + input.id + '" data-resource-id="' + resourceId + '" /></div>').join("") + '</div>';
      }
      return '<label>' + label + '</label><input data-live-input="' + input.id + '" placeholder="' + label + '" />';
    }
    function dashboardContactConfirm(mechanic) {
      if (mechanic.family !== "exchange") return "";
      return '<label class="contactTarget"><input type="checkbox" data-live-input="contactConfirmed" /> Telephones au contact ou joueurs cote a cote</label>';
    }
    function dashboardActorMatches(action, participant) {
      return action.actor === "any" || participant.roleId === action.actor;
    }
    function dashboardActionModes(mechanic) {
      return Array.isArray(mechanic?.resolution?.modes) ? mechanic.resolution.modes : [mechanic?.resolution?.mode].filter(Boolean);
    }
    function isPhaseResolutionMechanic(mechanic) {
      const modes = dashboardActionModes(mechanic);
      return mechanic && (mechanic.family === "live-administration" || modes.includes("liveThenRecord") || modes.includes("guidedInApp"));
    }
    function renderDashboardActionCard(session, action, cssClass, buttonClass, buttonLabel) {
      const mechanic = (session.module.mechanics || []).find((candidate) => candidate.id === action.mechanicId) || {};
      const actors = session.participants.filter((participant) => dashboardActorMatches(action, participant));
      const actorOptions = actors.map((participant) => option(participant.id, participant.name + " (" + dashboardRoleLabel(session, participant.roleId) + ")")).join("");
      const controls = (mechanic.inputs || []).map((input) => dashboardActionInputControl(session, input)).join("");
      const disabled = actors.length === 0 ? " disabled" : "";
      const hint = actors.length === 0 ? '<div class="muted">Aucun acteur autorise dans cette phase.</div>' : "";
      return '<div class="item actionCard ' + cssClass + ' action-' + (mechanic.family || "generic") + '"><div class="actionHeader"><strong><span class="actionIcon">' + actionIcon(session, { ...action, mechanicFamily: mechanic.family }) + '</span> ' + action.name + '</strong><span class="actionMeta">' + (mechanic.family || "action") + '</span></div><div class="muted">' + (mechanic.summary || action.fallback || action.id) + '</div>' + interactionCue(session, { ...action, mechanicFamily: mechanic.family }) + hint + '<label>Acteur</label><select data-live-actor>' + actorOptions + '</select>' + dashboardContactConfirm(mechanic) + controls + '<button class="secondary ' + buttonClass + '" data-action-id="' + action.id + '"' + disabled + '>' + buttonLabel + '</button></div>';
    }
    function renderGameControls(session) {
      const actions = (session.module.actions || []).filter((action) => {
        if (action.phase !== "*" && action.phase !== session.phase.id) return false;
        const mechanic = (session.module.mechanics || []).find((candidate) => candidate.id === action.mechanicId);
        return !isPhaseResolutionMechanic(mechanic);
      });
      return actions.map((action) => renderDashboardActionCard(session, action, "gameControlCard", "performGameAction", "Declencher")).join("") || '<div class="muted">Aucun controle de jeu dans cette phase</div>';
    }
    function renderPhaseResolutionActions(session) {
      const actions = (session.module.actions || []).filter((action) => {
        if (action.phase !== "*" && action.phase !== session.phase.id) return false;
        const mechanic = (session.module.mechanics || []).find((candidate) => candidate.id === action.mechanicId);
        return isPhaseResolutionMechanic(mechanic);
      });
      return actions.map((action) => renderDashboardActionCard(session, action, "phaseResolutionCard", "recordPhaseResolution", "Valider la resolution")).join("") || '<div class="muted">Aucune resolution guidee dans cette phase</div>';
    }
    function formatClock(clock) {
      if (!clock) return "sans minuteur";
      const end = clock.phaseEndsAt ? new Date(clock.phaseEndsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "fin libre";
      return "Tour " + clock.turn + " - " + (clock.phaseDurationSeconds || "sans duree") + "s - fin " + end;
    }
    function participantUrl() {
      const code = byId("code").value || sessionCode;
      return new URL("/play?code=" + encodeURIComponent(code), location.href).toString();
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
      setGameSelectionLocked(false);
    }
    async function loadNetworkInfo() {
      try {
        const info = await api("/network");
        const urls = (info.recommendedUrls || []).map((entry) => (
          '<div class="networkUrl"><div class="muted">' + entry.name + '</div><a href="' + entry.participantUrl + '">' + entry.participantUrl + '</a><div class="muted">Dashboard: ' + entry.dashboardUrl + '</div></div>'
        )).join("");
        byId("networkPanel").innerHTML = urls || '<div class="networkUrl"><div class="muted">Aucune IP Wi-Fi detectee.</div><a href="' + info.localhost.participantUrl + '">' + info.localhost.participantUrl + '</a><div class="muted">Sur telephone: verifier le meme Wi-Fi ou le pare-feu Windows.</div></div>';
      } catch (error) {
        byId("networkPanel").innerHTML = '<div class="muted">Infos reseau indisponibles: ' + error.message + '</div>';
      }
    }
    async function loadModuleDetails(moduleId) {
      if (currentSession) return;
      const module = await api("/modules/" + moduleId);
      byId("assignRoleId").innerHTML = module.roles.map((role) => option(role.id, role.name)).join("");
      byId("resourceId").innerHTML = module.resources.map((resource) => option(resource.id, resource.name)).join("");
    }
    function setGameSelectionLocked(locked) {
      byId("module").disabled = locked;
      byId("create").disabled = locked;
      byId("seed").disabled = locked;
      byId("newSession").disabled = false;
      byId("currentGame").textContent = locked && currentSession
        ? "Session active: " + currentSession.module.name + " (" + currentSession.code + "). Le jeu ne peut plus etre change pour cette table."
        : "Choisis le jeu, puis cree la session.";
    }
    function syncSessionMenus(session) {
      byId("module").value = session.module.id;
      byId("assignRoleId").innerHTML = session.module.roles.map((role) => option(role.id, role.name)).join("");
      byId("resourceId").innerHTML = session.module.resources.map((resource) => option(resource.id, resource.name)).join("");
      setGameSelectionLocked(true);
    }
    async function refresh() {
      const code = byId("code").value || sessionCode;
      if (!code) return;
      const session = await api("/sessions/" + code + "/read-models/dashboard");
      render(session);
    }
    function render(session) {
      currentSession = session;
      applyTheme(session.module.uiTheme);
      syncSessionMenus(session);
      sessionCode = session.code;
      byId("code").value = session.code;
      byId("participantLink").href = "/play?code=" + encodeURIComponent(session.code);
      byId("summary").innerHTML = [
        '<span class="pill">Code ' + session.code + '</span>',
        '<span class="pill">' + session.module.name + '</span>',
        '<span class="pill">' + formatTurnPhase(session.turnPhase, session.phaseClock) + '</span>',
        '<span class="pill">' + session.devices.length + ' appareil(s)</span>',
        '<span class="pill">' + session.participants.length + ' participant(s)</span>',
        Object.keys(session.statuses || {}).length ? renderStatusList(session.statuses) : ""
      ].join(" ");
      if (byId("coupCommitmentDuration")) byId("coupCommitmentDuration").value = session.statuses.coupCommitmentSeconds || 120;
      byId("themePanel").innerHTML = renderThemePanel(session);
      byId("mvpPanel").innerHTML = renderMvpPanel(session);
      byId("dashboardTabRules").innerHTML = renderRulesReference(session.rulesReference);
      byId("dashboardTabCharacters").innerHTML = renderDashboardCharacters(session);
      byId("participants").innerHTML = renderDashboardParticipants(session);
      byId("devices").innerHTML = session.devices.map((device) => {
        const participant = session.participants.find((candidate) => candidate.id === device.participantId);
        return '<div class="item"><strong>' + device.name + '</strong><div>' + (participant ? participant.name : "non lie") + '</div><div class="muted">' + (device.connected ? "connecte" : "deconnecte") + '</div></div>';
      }).join("") || '<div class="muted">Aucun appareil</div>';
      byId("scores").innerHTML = renderDashboardScores(session);
      byId("aggregates").innerHTML = renderDashboardAggregates(session);
      byId("messages").innerHTML = (session.messages || []).slice(-6).map((message) => '<div class="item"><strong>' + message.channel + '</strong><div>' + message.text + '</div><div class="muted">' + message.target + '</div></div>').join("") || '<div class="muted">Aucun message</div>';
      byId("exchangeLog").innerHTML = (session.exchanges || []).slice(-8).map((exchange) => {
        const from = session.participants.find((participant) => participant.id === exchange.fromParticipantId);
        const to = session.participants.find((participant) => participant.id === exchange.toParticipantId);
        const resources = Object.entries(exchange.resources).map(([key, value]) => dashboardResourceLabel(session, key) + ": " + value).join(" / ");
        return '<div class="item"><strong>' + (from ? from.name : "source inconnue") + ' -> ' + (to ? to.name : "cible inconnue") + '</strong><div>' + resources + '</div><div class="muted">' + exchange.status + '</div></div>';
      }).join("") || '<div class="muted">Aucun echange</div>';
      byId("sessionRoles").innerHTML = renderSessionRoles(session);
      byId("gameControls").innerHTML = renderGameControls(session);
      byId("phaseResolutions").innerHTML = renderPhaseResolutionActions(session);
      byId("pendingResolutions").innerHTML = (session.pendingResolutions || []).map((resolution) => {
        const participant = session.participants.find((candidate) => candidate.id === resolution.participantId);
        const payload = dashboardResolutionPayloadDetails(session, resolution);
        const outcomeList = resolution.recommendedOutcomes || [{ id: "facilitator-resolved", label: "Marquer resolue" }];
        const outcomes = outcomeList.map((outcome) => '<button class="secondary resolveResolution" data-resolution-id="' + resolution.id + '" data-outcome="' + outcome.id + '">' + outcome.label + '</button>').join("");
        const outcomeDetails = outcomeList.map((outcome) => dashboardOutcomeDetails(session, outcome)).join("");
        return '<div class="item' + dashboardResolutionClass(resolution) + '"><strong>' + resolution.type + '</strong><div>' + (resolution.summary || (participant ? participant.name : "table")) + '</div><div class="muted">' + (resolution.mechanicId || resolution.mechanicFamily || "sans mecanique") + '</div>' + payload + dashboardAutomaticEffectDetails(session, resolution) + outcomeDetails + '<label>Note MJ</label><input data-resolution-note placeholder="Note optionnelle" /><div class="row"><div><label>Cible effet</label><select data-resolution-effect-participant>' + dashboardParticipantOptions(session) + '</select></div><div><label>Ressource</label><select data-resolution-resource>' + dashboardResourceOptions(session) + '</select></div></div><label>Delta ressource</label><input type="number" value="0" data-resolution-resource-delta /><div class="row"><div><label>Statut</label><input data-resolution-state placeholder="ex: coupOutcome" /></div><div><label>Valeur</label><input data-resolution-state-value placeholder="ex: attacker-wins" /></div></div><div class="actions">' + outcomes + '</div></div>';
      }).join("") || '<div class="muted">Aucune resolution en attente</div>';
      byId("audit").textContent = JSON.stringify((session.audit || []).slice(-12), null, 2);
      byId("state").textContent = JSON.stringify(session, null, 2);
      syncSelectors(session);
      updateInjectionControls(session);
    }
    async function playSoundCue(url) {
      const audio = new Audio(url);
      await audio.play();
    }
    function syncSelectors(session) {
      const participantOptions = session.participants.map((participant) => option(participant.id, participant.name)).join("");
      const messageOptions = option("allParticipants", "Tous") + option("dashboard", "Dashboard") + session.participants.map((participant) => option("participant:" + participant.id, participant.name)).join("");
      byId("bindParticipantId").innerHTML = participantOptions;
      byId("resourceParticipant").innerHTML = participantOptions;
      byId("roleParticipant").innerHTML = participantOptions;
      byId("sessionRoleParticipant").innerHTML = option("", "Non assigne") + participantOptions;
      byId("sessionRoleId").innerHTML = (session.module.sessionRoles || []).map((sessionRole) => option(sessionRole.id, sessionRole.name)).join("");
      byId("messageTarget").innerHTML = messageOptions;
      byId("bindDeviceId").innerHTML = session.devices.map((device) => option(device.id, device.name + (device.participantId ? " (lie)" : ""))).join("");
    }
    function collectResolutionPayload(card) {
      const payload = {};
      const effects = [];
      const participantId = card.querySelector("[data-resolution-effect-participant]")?.value || undefined;
      const resource = card.querySelector("[data-resolution-resource]")?.value;
      const delta = Number(card.querySelector("[data-resolution-resource-delta]")?.value || 0);
      if (resource && Number.isInteger(delta) && delta !== 0) {
        const effect = { type: "adjustResource", resource, delta };
        if (participantId) effect.participantId = participantId;
        effects.push(effect);
      }
      const state = card.querySelector("[data-resolution-state]")?.value.trim();
      if (state) {
        const effect = { type: "setState", state, value: card.querySelector("[data-resolution-state-value]")?.value || true };
        if (participantId) effect.participantId = participantId;
        effects.push(effect);
      }
      if (effects.length) payload.effects = effects;
      return payload;
    }
    function collectPhaseResolutionPayload(card) {
      const payload = {};
      card.querySelectorAll("[data-live-input]").forEach((field) => {
        const key = field.dataset.liveInput;
        if (!key) return;
        if (field.type === "checkbox") {
          if (!field.checked) return;
          const list = Array.isArray(payload[key]) ? payload[key] : [];
          if (key === "contactConfirmed") {
            payload[key] = true;
            return;
          }
          list.push(field.value);
          payload[key] = list;
          return;
        }
        if (field.dataset.resourceId) {
          const value = Number(field.value);
          if (value > 0) {
            const bundle = payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key]) ? payload[key] : {};
            bundle[field.dataset.resourceId] = value;
            payload[key] = bundle;
          }
          return;
        }
        if (field.dataset.listIndex !== undefined) {
          const list = Array.isArray(payload[key]) ? payload[key] : [];
          if (field.value) list[Number(field.dataset.listIndex)] = field.value;
          payload[key] = list.filter(Boolean);
          return;
        }
        if (field.value) payload[key] = field.value;
      });
      return payload;
    }
    byId("module").addEventListener("change", async () => {
      if (currentSession) return;
      await loadModuleDetails(byId("module").value);
    });
    byId("create").addEventListener("click", () => run(async () => {
      const moduleId = byId("module").value;
      const session = await api("/sessions", { method: "POST", body: JSON.stringify({ moduleId }) });
      sessionCode = session.code;
      byId("code").value = session.code;
      connectLive(session.code);
      render(session);
    }));
    byId("seed").addEventListener("click", () => run(async () => {
      const session = await api("/demo/putsch-lite", { method: "POST", body: JSON.stringify({}) });
      byId("module").value = session.module.id;
      await loadModuleDetails(session.module.id);
      sessionCode = session.code;
      byId("code").value = session.code;
      connectLive(session.code);
      render(session);
    }));
    byId("createParticipant").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/participants", { method: "POST", body: JSON.stringify({ name: byId("participantName").value }) });
      byId("participantName").value = "";
      await refresh();
    }));
    byId("newSession").addEventListener("click", () => run(async () => {
      currentSession = undefined;
      sessionCode = "";
      byId("code").value = "";
      byId("summary").innerHTML = "";
      setGameSelectionLocked(false);
      await loadModuleDetails(byId("module").value);
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
    byId("assignSessionRole").addEventListener("click", () => run(async () => {
      const payload = { enabled: true };
      if (byId("sessionRoleParticipant").value) payload.participantId = byId("sessionRoleParticipant").value;
      await api("/sessions/" + sessionCode + "/session-roles/" + byId("sessionRoleId").value, { method: "POST", body: JSON.stringify(payload) });
      await refresh();
    }));
    byId("pendingResolutions").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest(".resolveResolution");
      if (!button) return;
      const card = button.closest(".item");
      const note = card.querySelector("[data-resolution-note]")?.value.trim();
      const body = { outcome: button.dataset.outcome || "facilitator-resolved", payload: collectResolutionPayload(card) };
      if (note) body.note = note;
      await api("/sessions/" + sessionCode + "/resolutions/" + button.dataset.resolutionId + "/resolve", { method: "POST", body: JSON.stringify(body) });
      await refresh();
    }));
    byId("gameControls").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest(".performGameAction");
      if (!button) return;
      const card = button.closest(".gameControlCard");
      await api("/sessions/" + sessionCode + "/events", { method: "POST", body: JSON.stringify({
        type: "action.triggered",
        actionId: button.dataset.actionId,
        participantId: card.querySelector("[data-live-actor]")?.value,
        payload: collectPhaseResolutionPayload(card)
      }) });
      await refresh();
    }));
    byId("phaseResolutions").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest(".recordPhaseResolution");
      if (!button) return;
      const card = button.closest(".phaseResolutionCard");
      await api("/sessions/" + sessionCode + "/events", { method: "POST", body: JSON.stringify({
        type: "action.recorded",
        actionId: button.dataset.actionId,
        participantId: card.querySelector("[data-live-actor]")?.value,
        payload: collectPhaseResolutionPayload(card)
      }) });
      await refresh();
    }));
    byId("setResource").addEventListener("click", () => run(async () => {
      await api("/sessions/" + sessionCode + "/players/" + byId("resourceParticipant").value + "/resources", { method: "POST", body: JSON.stringify({ resourceId: byId("resourceId").value, value: Number(byId("resourceValue").value) }) });
      await refresh();
    }));
    byId("setTimer").addEventListener("click", () => run(async () => {
      const code = byId("code").value || sessionCode;
      await api("/sessions/" + code + "/phases/timer", { method: "POST", body: JSON.stringify({ durationSeconds: Number(byId("phaseDuration").value) }) });
      await refresh();
    }));
    byId("setCoupCommitmentDuration").addEventListener("click", () => run(async () => {
      const code = byId("code").value || sessionCode;
      await api("/sessions/" + code + "/state", { method: "POST", body: JSON.stringify({ state: "coupCommitmentSeconds", value: Number(byId("coupCommitmentDuration").value) }) });
      await refresh();
    }));
    byId("advance").addEventListener("click", () => run(async () => {
      const code = byId("code").value || sessionCode;
      await api("/sessions/" + code + "/phases/advance", { method: "POST", body: JSON.stringify({}) });
      await refresh();
    }));
    byId("themePanel").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest("[data-sound-url]");
      if (!button) return;
      await playSoundCue(button.dataset.soundUrl);
    }));
    byId("refresh").addEventListener("click", () => run(refresh));
    byId("copyParticipantLink").addEventListener("click", () => run(async () => {
      const link = participantUrl();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setError("Lien participant copie.");
        return;
      }
      byId("code").value = link;
      setError("Lien place dans le champ code.");
    }));
    document.querySelectorAll("[data-dashboard-tab]").forEach((button) => {
      button.addEventListener("click", () => setDashboardTab(button.dataset.dashboardTab));
    });
    loadNetworkInfo();
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
  <title>Ludovive Participant</title>
  <style>
    :root { color-scheme: dark; --bg: #101214; --panel: #181b1f; --surface: #111417; --field: #0d0f11; --line: #343a42; --ink: #f2f4f5; --muted: #aab2bb; --accent: #b94b42; --green: #3f6b4d; --blue: #315875; --warning: #b88a3b; --radius: 8px; --shadow: 0 16px 42px rgba(0,0,0,.32); --font-body: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; --font-display: var(--font-body); --font-numeric: ui-monospace, "SFMono-Regular", Consolas, monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--font-body); background:
      radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 19rem),
      radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--blue) 16%, transparent), transparent 20rem),
      var(--bg); color: var(--ink); }
    body:before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .16; background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 26px 26px; mask-image: linear-gradient(to bottom, black, transparent 70%); }
    main { position: relative; width: min(560px, 100%); margin: 0 auto; padding: 14px; }
    h1 { margin: 0 0 4px; font-family: var(--font-display); font-size: 27px; font-weight: 850; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-family: var(--font-display); font-size: 14px; font-weight: 850; letter-spacing: .07em; text-transform: uppercase; color: color-mix(in srgb, var(--ink) 78%, var(--muted)); }
    h3 { margin: 16px 0 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; }
    section { border: 1px solid color-mix(in srgb, var(--line) 82%, white); border-radius: var(--radius); padding: 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 94%, white), color-mix(in srgb, var(--panel) 92%, black)); margin: 14px 0; box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, var(--shadow); }
    label { display: block; margin: 10px 0 5px; color: var(--muted); font-size: 13px; }
    input, select, button { width: 100%; font: inherit; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--line) 82%, white); padding: 11px; }
    input, select { background: color-mix(in srgb, var(--field) 90%, black); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset; }
    input:focus, select:focus { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: 1px; }
    button { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 86%, white), color-mix(in srgb, var(--accent) 86%, black)); color: white; cursor: pointer; margin-top: 12px; min-height: 46px; font-weight: 850; border-color: color-mix(in srgb, var(--accent) 70%, white); box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 10px 22px rgba(0,0,0,.22); }
    button:hover { transform: translateY(-1px); filter: brightness(1.04); }
    button.secondary { background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 84%, white), var(--blue)); border-color: color-mix(in srgb, var(--blue) 70%, white); }
    button.success { background: linear-gradient(180deg, color-mix(in srgb, var(--green) 84%, white), var(--green)); border-color: color-mix(in srgb, var(--green) 70%, white); }
    button.neutral { background: linear-gradient(180deg, #3a414a, #272c32); border-color: #565f69; }
    .muted { color: var(--muted); }
    .pill { display: inline-block; padding: 4px 8px; border: 1px solid #59616b; border-radius: 999px; margin: 2px; font-size: 12px; color: #dce1e6; }
    .stack { display: grid; gap: 10px; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .tabButton { width: auto; min-height: 36px; margin: 0; padding: 8px 10px; background: linear-gradient(180deg, #3a414a, #272c32); border-color: #565f69; }
    .tabButton.active { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 86%, white), color-mix(in srgb, var(--accent) 86%, black)); border-color: color-mix(in srgb, var(--accent) 70%, white); }
    .tabPanel.hidden { display: none; }
    .brandLine { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 12px; border: 1px solid color-mix(in srgb, var(--line) 75%, white); border-radius: var(--radius); background: linear-gradient(135deg, color-mix(in srgb, var(--panel) 84%, var(--accent)), color-mix(in srgb, var(--panel) 92%, black)); box-shadow: var(--shadow); }
    .brandMark { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 82%, white), color-mix(in srgb, var(--accent) 76%, black)); color: white; font-weight: 900; letter-spacing: .05em; box-shadow: 0 12px 24px rgba(0,0,0,.24); }
    .item { border: 1px solid color-mix(in srgb, var(--line) 76%, white); border-radius: var(--radius); padding: 11px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 93%, white), color-mix(in srgb, var(--surface) 94%, black)); box-shadow: 0 1px 0 rgba(255,255,255,.04) inset; }
    .actionHeader { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .actionHeader strong { margin: 0; }
    .actionMeta { flex: 0 0 auto; color: var(--muted); font-size: 11px; border: 1px solid #59616b; border-radius: 999px; padding: 4px 7px; text-transform: uppercase; letter-spacing: .04em; }
    .resourceWallet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
    .resourceChip { display: grid; grid-template-columns: 38px 1fr; align-items: center; gap: 8px; border: 1px solid color-mix(in srgb, var(--line) 78%, white); border-radius: var(--radius); padding: 9px; min-width: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--field) 92%, white), var(--field)); }
    .resourceChip .resourceValue { font-family: var(--font-numeric); font-size: 22px; font-weight: 700; line-height: 1; }
    .resourceChip .resourceName { color: var(--muted); font-size: 12px; line-height: 1.2; overflow-wrap: anywhere; }
    .resolutionFocus { border-color: color-mix(in srgb, var(--warning) 55%, var(--line)); }
    .themeStrip { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel)); }
    .gestureCard { display: grid; grid-template-columns: 96px 1fr; gap: 11px; align-items: center; border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); border-radius: var(--radius); margin-top: 9px; padding: 9px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--surface)), color-mix(in srgb, var(--surface) 92%, black)); }
    .gestureTitle { font-weight: 700; }
    .gestureTag { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .gestureArt { position: relative; height: 62px; border-radius: 8px; background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 62%), color-mix(in srgb, var(--field) 72%, var(--accent)); overflow: hidden; }
    .phone { position: absolute; width: 24px; height: 42px; border: 2px solid var(--ink); border-radius: 6px; background: #0b0d0f; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
    .phone:after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 3px; height: 2px; border-radius: 999px; background: var(--muted); }
    .phoneA { left: 17px; top: 8px; transform: rotate(-8deg); }
    .phoneB { right: 17px; top: 8px; transform: rotate(8deg); }
    .motion { position: absolute; width: 9px; height: 9px; border-radius: 999px; border: 2px solid var(--warning); opacity: .9; }
    .m1 { left: 43px; top: 16px; } .m2 { left: 54px; top: 27px; } .m3 { left: 64px; top: 38px; }
    .gesture-pour-liquid .phoneA { transform: rotate(-36deg); top: 2px; }
    .gesture-touch-phones .phoneA { left: 28px; transform: rotate(0deg); } .gesture-touch-phones .phoneB { right: 28px; transform: rotate(0deg); }
    .gesture-strike-phone .phoneA { transform: rotate(-42deg); left: 20px; top: 4px; } .gesture-strike-phone .phoneB { transform: rotate(48deg); right: 20px; top: 11px; }
    .gesture-parry-phone .phoneA { transform: rotate(52deg); left: 22px; } .gesture-parry-phone .phoneB { transform: rotate(-52deg); right: 22px; }
    .gesture-ballot-drop .phoneA { transform: rotate(90deg); top: 14px; left: 34px; } .gesture-ballot-drop .phoneB { opacity: .25; }
    .gesture-palm-cover .phoneA { left: 34px; } .gesture-palm-cover .phoneB { width: 40px; height: 22px; right: 18px; top: 18px; border-radius: 999px; opacity: .55; }
    .gestureCue { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 999px; margin-top: 8px; background: color-mix(in srgb, var(--accent) 15%, transparent); font-size: 13px; }
    .fallbackCue { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .action-exchange { border-color: color-mix(in srgb, var(--green) 55%, var(--line)); }
    .action-contest { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
    .action-vote { border-color: color-mix(in srgb, var(--warning) 60%, var(--line)); }
    .contactTarget { border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 8px; padding: 9px; margin: 8px 0; background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .contactTarget input[type="checkbox"] { width: auto; margin-right: 6px; }
    .resourcePushGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 9px; }
    .resourcePushTile { border: 1px solid #3c454f; border-radius: 8px; padding: 9px; background: #111417; min-width: 0; }
    .resourcePushTile strong { display: flex; align-items: center; gap: 7px; min-height: 36px; font-size: 13px; line-height: 1.2; }
    .resourceIcon, .actionIcon { flex: 0 0 auto; display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 7px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 34%, #0d0f11), color-mix(in srgb, var(--field) 92%, black)); color: var(--ink); font-weight: 900; font-size: 10px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); box-shadow: 0 1px 0 rgba(255,255,255,.06) inset; overflow: hidden; }
    .resourceIcon img, .actionIcon img { width: 23px; height: 23px; display: block; object-fit: contain; }
    .roleTitle, .turnPhaseName { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .soundCueButton { width: auto; min-height: 30px; margin: 5px 5px 0 0; padding: 5px 8px; font-size: 12px; }
    .resourceAmount { font-size: 22px; font-weight: 700; margin-top: 4px; }
    .resourcePushControls { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
    .resourcePushControls button { min-height: 38px; margin: 0; padding: 7px; }
    .resourcePushTile input { position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; }
    .turnPhase { display: grid; gap: 6px; }
    .turnPhaseHeader { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .turnPhaseName { font-size: 18px; font-weight: 700; color: var(--ink); }
    .phaseTrack { display: grid; grid-template-columns: repeat(var(--phase-total, 1), minmax(0, 1fr)); gap: 4px; }
    .phaseStep { height: 7px; border-radius: 999px; background: #30363d; }
    .phaseStep.active { background: var(--accent); }
    .timerGauge { height: 8px; border-radius: 999px; background: #30363d; overflow: hidden; }
    .timerGauge span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--warning)); }
    @media (max-width: 380px) { .resourcePushGrid, .resourceWallet { grid-template-columns: 1fr; } }
    .error { color: #ffb1a8; min-height: 20px; }
    .hidden { display: none; }
    pre { white-space: pre-wrap; background: #0d0f11; padding: 12px; border-radius: 6px; overflow: auto; max-height: 260px; }
  </style>
</head>
<body>
  <main>
    <div class="brandLine"><span class="brandMark">LV</span><div><h1>Ludovive</h1><div class="muted">App participant</div></div></div>

    <section id="joinPanel">
      <h2>Rejoindre une session</h2>
      <label for="code">Code MJ</label>
      <input id="code" autocomplete="off" placeholder="ABC123" />
      <button id="loadSession" class="secondary">Verifier la session</button>
      <label for="name">Nom affiche</label>
      <input id="name" autocomplete="name" placeholder="Ana" />
      <div id="waitingRoomHint" class="muted">Entre ton nom: l'hote t'affectera ensuite un role.</div>
      <button id="join">Entrer en salle d'attente</button>
      <div class="error" id="error"></div>
    </section>

    <section id="tablePanel" class="hidden">
      <h2 id="participantTitle">Participant</h2>
      <div class="tabs">
        <button class="tabButton active" data-player-tab="table">Table</button>
        <button class="tabButton" data-player-tab="rules">Regles</button>
        <button class="tabButton" data-player-tab="character">Personnage</button>
      </div>
      <div id="playerTabTable" class="tabPanel">
        <div id="themeStrip" class="stack"></div>
        <div id="summary"></div>
        <div id="waitingRoomNotice"></div>
        <div id="phaseClock" class="stack"></div>
        <h3>Ressources</h3>
        <div id="resources" class="stack"></div>
        <h3>Statuts</h3>
        <div id="statuses" class="stack"></div>
        <h3>Historique des echanges</h3>
        <div id="exchanges" class="stack"></div>
        <h3>Messages</h3>
        <div id="messages" class="stack"></div>
        <h3>A traiter</h3>
        <div id="pendingResolutions" class="stack"></div>
        <h3>Actions de cette phase</h3>
        <div id="actions" class="stack"></div>
      </div>
      <div id="playerTabRules" class="tabPanel hidden"></div>
      <div id="playerTabCharacter" class="tabPanel hidden">
        <div id="roleDetails" class="stack"></div>
      </div>
      <button id="leave" class="secondary">Oublier cet appareil</button>
    </section>
  </main>
  <script>
    let liveSocket;
    const storedSessionCode = (localStorage.getItem("ludovive.sessionCode") || localStorage.getItem("thaumacord.sessionCode") || "").toUpperCase();
    const urlCode = new URLSearchParams(location.search).get("code") || "";
    const invitedSessionCode = urlCode.toUpperCase();
    const switchingSession = Boolean(invitedSessionCode && storedSessionCode && invitedSessionCode !== storedSessionCode);
    let deviceId = switchingSession ? "" : localStorage.getItem("ludovive.deviceId") || localStorage.getItem("thaumacord.deviceId") || "";
    let sessionCode = invitedSessionCode || storedSessionCode;
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
      byId("waitingRoomHint").textContent = "Session " + session.module.name + " trouvee. Entre ton nom; l'hote t'affectera un role.";
      sessionCode = session.code;
      byId("code").value = session.code;
    }
    async function refreshDevice() {
      if (!sessionCode || !deviceId) return;
      try {
        const result = await api("/sessions/" + sessionCode + "/devices/" + deviceId + "/sync");
        render(result.readModel);
      } catch (error) {
        resetToJoin("Appareil a reconnecter: " + error.message);
      }
    }
    function forgetDevice() {
      deviceId = "";
      localStorage.removeItem("ludovive.deviceId");
      localStorage.removeItem("ludovive.sessionCode");
      localStorage.removeItem("thaumacord.deviceId");
      localStorage.removeItem("thaumacord.sessionCode");
    }
    function resetToJoin(message) {
      forgetDevice();
      byId("joinPanel").classList.remove("hidden");
      byId("tablePanel").classList.add("hidden");
      setError(message);
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
    function assetUrl(reference, kind) {
      if (!reference) return "";
      const folder = kind === "icon" ? "icons" : "sounds";
      const extension = kind === "icon" ? ".svg" : ".wav";
      if (reference.startsWith("/assets/" + folder + "/")) return reference;
      if (reference.startsWith(kind + ":")) {
        const name = reference.slice(kind.length + 1).replace(/[^a-z0-9-]/gi, "");
        return name ? "/assets/" + folder + "/" + name + extension : "";
      }
      return "";
    }
    function iconMarkup(value) {
      const url = assetUrl(value, "icon");
      return url ? '<img src="' + url + '" alt="" loading="lazy" />' : value;
    }
    function soundUrl(cue) {
      return assetUrl(cue?.url || "", "sound");
    }
    function resourceIcon(model, resourceId) {
      const themed = themeIcon(model, resourceId);
      if (themed) return iconMarkup(themed);
      const icons = {
        money: "$",
        copperShares: "Cu",
        weapons: "CF",
        ammo: "CM",
        influence: "!",
        drugBags: "D",
        voteBallots: "V",
        cf25: "25F",
        cf50: "50F",
        cf100: "100F",
        cm25: "25M",
        cm50: "50M",
        cm100: "100M",
        gold: "Au",
        income: "Inc",
        favor: "Fav",
        status: "Sta",
        hull: "Hull",
        oxygen: "O2",
        battery: "Bat",
        noise: "N",
        torpedoes: "Tor",
        intel: "Int"
      };
      return iconMarkup(icons[resourceId] || resourceId.slice(0, 2).toUpperCase());
    }
    function applyTheme(theme) {
      const colors = theme?.colors || {};
      const fonts = theme?.fonts || {};
      const root = document.documentElement;
      const map = { background: "--bg", panel: "--panel", ink: "--ink", muted: "--muted", accent: "--accent", secondary: "--blue", success: "--green", warning: "--warning" };
      Object.entries(map).forEach(([key, cssVar]) => { if (colors[key]) root.style.setProperty(cssVar, colors[key]); });
      const fontMap = { body: "--font-body", display: "--font-display", numeric: "--font-numeric" };
      Object.entries(fontMap).forEach(([key, cssVar]) => { if (fonts[key]) root.style.setProperty(cssVar, fonts[key]); });
    }
    function themeIcon(model, key) {
      return (model.module.uiTheme?.icons || {})[key] || "";
    }
    function roleIcon(model, role) {
      return iconMarkup(themeIcon(model, "role:" + role.id) || themeIcon(model, role.id) || "ROLE");
    }
    function phaseIcon(model, phase) {
      return iconMarkup(themeIcon(model, "phase:" + phase.id) || themeIcon(model, phase.id) || themeIcon(model, "track") || "PH");
    }
    function actionIcon(model, action) {
      const key = action.mechanicFamily || action.id;
      const fallback = {
        exchange: "TR",
        contest: "ATK",
        vote: "VOT",
        petition: "PET",
        market: "MKT",
        "timed-income": "INC",
        "live-administration": "ADM",
        coordination: "CMD",
        "resource-action": "SYS"
      };
      const themed = themeIcon(model, "action:" + action.id) || themeIcon(model, key) || themeIcon(model, "role:" + action.actor);
      return iconMarkup(themed || fallback[key] || "ACT");
    }
    function gestureMeta(gesture) {
      const gestures = {
        "touch-phones": { label: "Contact telephones", detail: "Les deux telephones se touchent avant validation.", proximity: "contact requis" },
        "pour-liquid": { label: "Verser", detail: "Incline ton telephone vers l'autre joueur pour pousser les ressources.", proximity: "telephones proches" },
        "shake-phones": { label: "Serrer", detail: "Mouvement bref de poignee de main avec les telephones.", proximity: "meme table" },
        "tap-stack": { label: "Poser sur la pile", detail: "Touche la zone ou la pile physique qui represente le marche.", proximity: "zone de table" },
        "palm-cover": { label: "Couvrir", detail: "Couvre l'ecran pour une transaction discrete.", proximity: "a vue courte" },
        "ballot-drop": { label: "Deposer", detail: "Pose le telephone comme un bulletin dans l'urne.", proximity: "zone de vote" },
        "strike-phone": { label: "Frapper", detail: "Mouvement d'attaque court avec le telephone.", proximity: "duel proche" },
        "parry-phone": { label: "Parer", detail: "Presente ton telephone en parade pendant le compte a rebours.", proximity: "duel proche" },
        "hold-phone-up": { label: "Lever", detail: "Leve le telephone pour signaler un ordre.", proximity: "visible equipe" },
        "tilt-phone-forward": { label: "Incliner", detail: "Incline vers l'avant pour engager une action de poste.", proximity: "poste de table" },
        "phone-face-down": { label: "Retourner", detail: "Retourne le telephone face contre table.", proximity: "poste de table" },
        "slow-phone-arc": { label: "Balayage", detail: "Trace un arc lent pour une recherche ou un sonar.", proximity: "poste de table" },
        "slide-resource-to-edge": { label: "Pousser au bord", detail: "Fais glisser les jetons vers le bord de l'ecran.", proximity: "contact de table" }
      };
      return gestures[gesture] || { label: gesture, detail: "Geste declare par le module importe.", proximity: "selon module" };
    }
    function gestureArt(gesture) {
      const className = String(gesture || "generic").replace(/[^a-z0-9-]/g, "");
      return '<div class="gestureArt gesture-' + className + '"><span class="phone phoneA"></span><span class="phone phoneB"></span><span class="motion m1"></span><span class="motion m2"></span><span class="motion m3"></span></div>';
    }
    function renderGestureCard(model, action) {
      if (!action.gesture) return "";
      const meta = gestureMeta(action.gesture);
      const primary = model.module.uiTheme?.interactionLabels?.primary || "Geste";
      return '<div class="gestureCard">' + gestureArt(action.gesture) + '<div><div class="gestureTitle"><span class="actionIcon">' + actionIcon(model, action) + '</span> ' + primary + ': ' + (action.gestureLabel || meta.label) + '</div><div class="gestureTag">' + meta.proximity + '</div><div class="muted">' + meta.detail + '</div></div></div>';
    }
    function renderThemeStrip(model) {
      const theme = model.module.uiTheme || {};
      const cues = (model.module.soundboard || []).slice(0, 3).map((cue) => {
        const play = soundUrl(cue) ? '<button type="button" class="secondary soundCueButton" data-sound-url="' + soundUrl(cue) + '">Ecouter</button>' : "";
        return '<div class="muted">' + cue.name + '</div>' + play;
      }).join("");
      return '<div class="item themeStrip"><strong><span class="actionIcon">' + iconMarkup(themeIcon(model, "game") || "LV") + '</span> ' + model.module.name + '</strong><div class="muted">' + (theme.tone || "Partie en cours") + '</div>' + cues + '</div>';
    }
    function formatStatusValue(value) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
      return JSON.stringify(value);
    }
    function renderStatuses(statuses) {
      return Object.entries(statuses || {}).map(([key, value]) => '<div class="item"><strong>' + key + '</strong><div>' + formatStatusValue(value) + '</div></div>').join("") || '<div class="muted">Aucun statut</div>';
    }
    function renderRulesReference(reference) {
      if (!reference) return '<div class="muted">Aucune regle resumee</div>';
      const summary = reference.summary ? '<div class="item"><strong>Resume</strong><div>' + reference.summary + '</div></div>' : "";
      const sections = (reference.sections || []).map((section) => {
        const body = section.body ? '<div>' + section.body + '</div>' : "";
        const bullets = (section.bullets || []).length ? '<ul>' + section.bullets.map((bullet) => '<li>' + bullet + '</li>').join("") + '</ul>' : "";
        return '<div class="item"><strong>' + section.title + '</strong>' + body + bullets + '</div>';
      }).join("");
      return '<div class="stack">' + summary + sections + '</div>';
    }
    function setPlayerTab(name) {
      ["table", "rules", "character"].forEach((tab) => {
        document.querySelector('[data-player-tab="' + tab + '"]')?.classList.toggle("active", tab === name);
        byId("playerTab" + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.toggle("hidden", tab !== name);
      });
    }
    function renderStatusPills(statuses) {
      return Object.entries(statuses || {}).map(([key, value]) => '<span class="pill">' + key + ': ' + formatStatusValue(value) + '</span>').join("");
    }
    function roleLabel(model, roleId) {
      return model.module.roles.find((role) => role.id === roleId)?.name || roleId || "role a attribuer";
    }
    function renderRoleSheetBlock(title, value) {
      return value ? '<h3>' + title + '</h3><div>' + value + '</div>' : "";
    }
    function renderRoleSheetList(title, values) {
      return (values || []).length ? '<h3>' + title + '</h3><ul>' + values.map((item) => '<li>' + item + '</li>').join("") + '</ul>' : "";
    }
    function renderRoleSheet(role) {
      const sheet = role.roleSheet || {};
      const phaseFocus = (sheet.phaseFocus || []).length
        ? '<h3>Par phase</h3>' + sheet.phaseFocus.map((focus) => '<div class="item"><strong>' + (focus.title || focus.phase || "Phase") + '</strong><ul>' + (focus.bullets || []).map((item) => '<li>' + item + '</li>').join("") + '</ul></div>').join("")
        : "";
      return renderRoleSheetBlock("Univers", sheet.universe)
        + renderRoleSheetBlock("Qui vous etes", sheet.identity)
        + renderRoleSheetBlock("Facade publique", sheet.publicFace)
        + renderRoleSheetBlock("Brief secret", sheet.secretBriefing)
        + renderRoleSheetBlock("Objectif", sheet.objective)
        + renderRoleSheetBlock("Comment gagner", sheet.howToWin)
        + renderRoleSheetBlock("Comment jouer", sheet.howToPlay)
        + renderRoleSheetList("Premiers gestes", sheet.firstMoves)
        + renderRoleSheetList("Regles clefs", sheet.keyRules)
        + phaseFocus
        + renderRoleSheetList("Accroches de negociation", sheet.negotiationHooks)
        + renderRoleSheetList("Risques", sheet.risks)
        + renderRoleSheetList("Rappels", sheet.reminders);
    }
    function renderRoleDetails(model) {
      const role = model.characterReference?.ownRole || model.ownRole;
      if (!role) return '<div class="muted">Role de jeu a attribuer par l hote</div>';
      const responsibilities = (role.responsibilities || []).length ? '<h3>Responsabilites</h3><ul>' + role.responsibilities.map((item) => '<li>' + item + '</li>').join("") + '</ul>' : "";
      const actions = (role.actions || []).length ? '<h3>Actions</h3><div>' + role.actions.map((item) => '<span class="pill">' + item + '</span>').join("") + '</div>' : "";
      const resources = role.startingResources && Object.keys(role.startingResources).length ? '<h3>Depart</h3><div>' + Object.entries(role.startingResources).map(([key, value]) => '<span class="pill">' + resourceLabel(model, key) + ': ' + value + '</span>').join("") + '</div>' : "";
      const victory = role.victoryCondition?.text ? '<h3>Victoire</h3><div class="muted">' + role.victoryCondition.text + '</div>' : "";
      return '<div class="item"><strong class="roleTitle"><span class="actionIcon">' + roleIcon(model, role) + '</span> ' + role.name + '</strong>'
        + (role.officialRole ? '<div>' + role.officialRole + '</div>' : '')
        + (role.secretRole ? '<div class="muted">Secret: ' + role.secretRole + '</div>' : '')
        + renderRoleSheet(role) + responsibilities + actions + resources + victory
        + '</div>';
    }
    function formatClock(clock) {
      if (!clock) return "sans minuteur";
      const end = clock.phaseEndsAt ? new Date(clock.phaseEndsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "fin libre";
      return "Tour " + clock.turn + " - " + (clock.phaseDurationSeconds || "sans duree") + "s - fin " + end;
    }
    function formatTurnPhase(turnPhase, fallbackClock) {
      if (!turnPhase) return formatClock(fallbackClock);
      const end = turnPhase.endsAt ? new Date(turnPhase.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "fin libre";
      const duration = turnPhase.durationSeconds ? turnPhase.durationSeconds + "s" : "sans duree";
      return "Tour " + turnPhase.turn + " - Phase " + (turnPhase.phase.index + 1) + "/" + turnPhase.phase.total + " - " + duration + " - fin " + end;
    }
    function timerPercent(turnPhase) {
      if (!turnPhase?.endsAt || !turnPhase.durationSeconds) return 100;
      const remaining = Math.max(0, new Date(turnPhase.endsAt).getTime() - Date.now());
      return Math.max(0, Math.min(100, Math.round((remaining / (turnPhase.durationSeconds * 1000)) * 100)));
    }
    function renderTurnPhase(model) {
      const turnPhase = model.turnPhase;
      if (!turnPhase) return '<div class="item turnPhase"><strong><span class="actionIcon">' + phaseIcon(model, model.phase) + '</span> Phase ' + model.phase.name + '</strong><div class="muted">' + formatClock(model.phaseClock) + '</div></div>';
      const steps = Array.from({ length: turnPhase.phase.total }, (_, index) => '<span class="phaseStep' + (index === turnPhase.phase.index ? " active" : "") + '"></span>').join("");
      return '<div class="item turnPhase"><div class="turnPhaseHeader"><span class="pill">Tour ' + turnPhase.turn + '</span><span class="pill">Phase ' + (turnPhase.phase.index + 1) + '/' + turnPhase.phase.total + '</span></div><div class="turnPhaseName"><span class="actionIcon">' + phaseIcon(model, turnPhase.phase) + '</span> ' + turnPhase.phase.name + '</div><div class="phaseTrack" style="--phase-total:' + turnPhase.phase.total + '">' + steps + '</div><div class="timerGauge"><span style="width:' + timerPercent(turnPhase) + '%"></span></div><div class="muted">' + formatTurnPhase(turnPhase, model.phaseClock) + '</div></div>';
    }
    function renderPhasePlanSummary(model) {
      const plan = model.phasePlan;
      if (!plan) return "";
      const next = plan.nextPhase.startsNextTurn ? "Tour suivant: " : "Puis: ";
      return '<div class="item"><strong>Plan de phase</strong><div>' + plan.playableActionCount + ' action(s) possible(s)</div><div class="muted">' + plan.pendingResolutionCount + ' resolution(s) en attente</div><div class="muted">' + next + plan.nextPhase.name + '</div></div>';
    }
    function renderResourceWallet(model, resources) {
      const entries = Object.entries(resources || {}).filter(([, value]) => Number(value) !== 0);
      return entries.length ? '<div class="resourceWallet">' + entries.map(([key, value]) => '<div class="resourceChip"><span class="resourceIcon">' + resourceIcon(model, key) + '</span><div><div class="resourceValue">' + value + '</div><div class="resourceName">' + resourceLabel(model, key) + '</div></div></div>').join("") + '</div>' : '<div class="muted">Aucune ressource</div>';
    }
    function formatDeadline(deadline) {
      if (!deadline?.endsAt) return "temps libre";
      const remaining = Math.max(0, Math.ceil((new Date(deadline.endsAt).getTime() - Date.now()) / 1000));
      return remaining + "s restantes";
    }
    function renderPendingResolution(model, resolution) {
      const payload = resolution.payload || {};
      const title = resolution.mechanicId === "contested-coup" ? "Coup d'Etat en cours" : resolution.type;
      const defender = payload.defenderId ? model.visibleParticipants.find((participant) => participant.id === payload.defenderId)?.name || payload.defenderId : "";
      const deadline = payload.commitmentDeadline ? '<div class="pill">' + formatDeadline(payload.commitmentDeadline) + '</div>' : "";
      const petition = payload.petitionText ? '<div>' + payload.petitionText + '</div>' : "";
      const totals = payload.petitionVoteTotals ? '<div class="muted">Votes: ' + Object.entries(payload.petitionVoteTotals).map(([key, value]) => key + " " + value).join(" / ") + '</div>' : "";
      const secretHint = resolution.mechanicId === "contested-coup" ? '<div class="muted">Les engagements sont caches jusqu a resolution.</div>' : "";
      return '<div class="item resolutionFocus"><div class="actionHeader"><strong>' + title + '</strong><span class="actionMeta">' + (resolution.mechanicFamily || "resolution") + '</span></div>' + (defender ? '<div>Defenseur: ' + defender + '</div>' : '') + petition + totals + deadline + secretHint + '</div>';
    }
    function actionInputLabel(input) {
      const labels = {
        toParticipantId: "Receveur au contact",
        defenderId: "Cible",
        leaderIds: "Leaders",
        resources: "Ressources engagees",
        petitionText: "Demande",
        promotionCandidateId: "Faire entrer au conseil",
        eliminationCandidateId: "Eliminer du conseil",
        votes: "Vote"
      };
      return input.label || input.name || labels[input.id] || input.id;
    }
    function participantOptions(model, includeSelf) {
      return (model.visibleParticipants || [])
        .filter((participant) => includeSelf || participant.id !== model.participant.id)
        .map((participant) => option(participant.id, participant.name + (participant.roleId ? " (" + roleLabel(model, participant.roleId) + ")" : "")))
        .join("");
    }
    function actionInputControl(model, input) {
      if (!input || !input.id) return "";
      const label = actionInputLabel(input);
      if (input.type === "text") {
        return '<label>' + label + '</label><input data-action-input="' + input.id + '" placeholder="' + label + '" />';
      }
      if (input.type === "number") {
        return '<label>' + label + '</label><input type="number" min="1" value="1" data-action-input="' + input.id + '" />';
      }
      if (input.type === "participant") {
        return '<div class="contactTarget"><label>' + label + '</label><select data-action-input="' + input.id + '">' + participantOptions(model, false) + '</select><div class="fallbackCue">Ideal: toucher son telephone pour identifier le receveur. Ici, selection de secours.</div></div>';
      }
      if (input.type === "participant-list") {
        const count = Number(input.count || 2);
        return Array.from({ length: count }, (_, index) => '<label>' + label + ' ' + (index + 1) + '</label><select data-action-input="' + input.id + '" data-list-index="' + index + '">' + participantOptions(model, true) + '</select>').join("");
      }
      if (input.type === "enum") {
        return '<label>' + label + '</label><select data-action-input="' + input.id + '">' + (input.choices || []).map((choice) => option(choice, choice)).join("") + '</select>';
      }
      if (input.type === "resource-bundle") {
        const resources = input.allowed || Object.keys(model.participant.resources || {});
        return '<div class="fallbackCue">Pousse les jetons au pouce vers le joueur en contact. Le bouton final reste le secours tactile.</div><div class="resourcePushGrid">' + resources.map((resourceId) => {
          const available = (model.participant.resources || {})[resourceId] ?? 0;
          return '<div class="resourcePushTile" data-resource-tile="' + resourceId + '"><strong><span class="resourceIcon">' + resourceIcon(model, resourceId) + '</span>' + resourceLabel(model, resourceId) + '</strong><div class="muted">dispo ' + available + '</div><div class="resourceAmount" data-resource-amount="' + resourceId + '">0</div><input type="number" min="0" max="' + available + '" value="0" data-action-input="' + input.id + '" data-resource-id="' + resourceId + '" /><div class="resourcePushControls"><button type="button" class="secondary pushResource" data-resource-push="' + resourceId + '" data-step="1">+1</button><button type="button" class="secondary pushResource" data-resource-push="' + resourceId + '" data-step="5">+5</button><button type="button" class="neutral pushResource" data-resource-push="' + resourceId + '" data-step="-1">-1</button><button type="button" class="neutral pushResource" data-resource-push="' + resourceId + '" data-step="0">0</button></div></div>';
        }).join("") + '</div>';
      }
      return '<label>' + label + '</label><input data-action-input="' + input.id + '" placeholder="' + label + '" />';
    }
    function actionVerb(action) {
      if (action.mechanicFamily === "exchange") return "Proposer l'echange";
      if (action.mechanicFamily === "contest") return "Declarer";
      if (action.mechanicFamily === "petition") return "Soumettre";
      return "Declencher";
    }
    function actionHint(action) {
      if (action.mechanicFamily === "exchange") return "Action disponible pendant cette phase: le transfert sera controle par les regles.";
      if (action.mechanicFamily === "contest") return "Choisis la cible, les leaders et les ressources engagees.";
      if (action.mechanicFamily === "vote") return "Choisis tes bulletins, ta promotion et ton elimination.";
      if (action.mechanicFamily === "petition") return "La demande sera envoyee au meneur pour resolution.";
      return action.fallback || action.id;
    }
    function interactionCue(model, action) {
      const fallback = model.module.uiTheme?.interactionLabels?.fallback || "Bouton de secours";
      return renderGestureCard(model, action) + '<div class="fallbackCue">' + fallback + ': ' + (action.fallback || "confirmation manuelle") + '</div>';
    }
    function actionForm(model, action) {
      const inputs = action.inputs || [];
      if (!inputs.length) return "";
      const contact = action.mechanicFamily === "exchange"
        ? '<label class="contactTarget"><input type="checkbox" data-action-input="contactConfirmed" /> Telephones au contact, meme table, pas a distance</label>'
        : "";
      return '<div class="actionInputs">' + contact + inputs.map((input) => actionInputControl(model, input)).join("") + '</div>';
    }
    function renderActionCard(model, action) {
      return '<div class="item actionCard action-' + (action.mechanicFamily || "generic") + '"><div class="actionHeader"><strong><span class="actionIcon">' + actionIcon(model, action) + '</span> ' + action.name + '</strong><span class="actionMeta">' + (action.mechanicFamily || "action") + '</span></div><div class="muted">' + actionHint(action) + '</div>' + interactionCue(model, action) + actionForm(model, action) + '<button class="secondary actionButton" data-action-id="' + action.id + '">' + actionVerb(action) + '</button></div>';
    }
    function collectActionPayload(card) {
      const payload = {};
      card.querySelectorAll("[data-action-input]").forEach((field) => {
        const key = field.dataset.actionInput;
        if (!key) return;
        if (field.type === "checkbox") {
          payload[key] = Boolean(field.checked);
          return;
        }
        if (field.dataset.resourceId) {
          const value = Number(field.value);
          if (value > 0) {
            const bundle = payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key]) ? payload[key] : {};
            bundle[field.dataset.resourceId] = value;
            payload[key] = bundle;
          }
          return;
        }
        if (field.dataset.listIndex !== undefined) {
          const list = Array.isArray(payload[key]) ? payload[key] : [];
          if (field.value) list[Number(field.dataset.listIndex)] = field.value;
          payload[key] = list.filter(Boolean);
          return;
        }
        if (field.value) payload[key] = field.value;
      });
      return payload;
    }
    function updateResourcePush(card, resourceId, step) {
      const field = card.querySelector('[data-resource-id="' + resourceId + '"]');
      if (!field) return;
      const max = Number(field.getAttribute("max") || 999999);
      const current = Number(field.value || 0);
      const next = step === 0 ? 0 : Math.max(0, Math.min(max, current + step));
      field.value = String(next);
      const display = card.querySelector('[data-resource-amount="' + resourceId + '"]');
      if (display) display.textContent = String(next);
    }
    function render(model) {
      if (model.readModel === "device.unbound") {
        byId("joinPanel").classList.remove("hidden");
        byId("tablePanel").classList.add("hidden");
        return;
      }
      byId("joinPanel").classList.add("hidden");
      byId("tablePanel").classList.remove("hidden");
      applyTheme(model.module.uiTheme);
      byId("participantTitle").textContent = model.participant.name;
      byId("themeStrip").innerHTML = renderThemeStrip(model);
      byId("summary").innerHTML = [
        '<span class="pill">' + model.module.name + '</span>',
        '<span class="pill">' + formatTurnPhase(model.turnPhase, model.phaseClock) + '</span>',
        '<span class="pill">' + roleLabel(model, model.participant.roleId) + '</span>',
        renderStatusPills(model.tableStatuses)
      ].join(" ");
      byId("waitingRoomNotice").innerHTML = model.participant.roleId
        ? ""
        : "<div class=\"item resolutionFocus\"><strong>Salle d'attente</strong><div>L'hote voit ton telephone et doit maintenant t'affecter un role.</div></div>";
      byId("phaseClock").innerHTML = renderTurnPhase(model);
      byId("phaseClock").innerHTML += renderPhasePlanSummary(model);
      byId("roleDetails").innerHTML = renderRoleDetails(model);
      byId("playerTabRules").innerHTML = renderRulesReference(model.rulesReference);
      byId("resources").innerHTML = renderResourceWallet(model, model.participant.resources);
      byId("statuses").innerHTML = renderStatuses(model.participant.statuses);
      byId("exchanges").innerHTML = (model.exchanges || []).slice(-5).map((exchange) => {
        const direction = exchange.fromParticipantId === model.participant.id ? "envoye" : "recu";
        const resources = Object.entries(exchange.resources).map(([key, value]) => resourceLabel(model, key) + ": " + value).join(" / ");
        return '<div class="item"><strong>' + direction + '</strong><div>' + resources + '</div></div>';
      }).join("") || '<div class="muted">Aucun echange</div>';
      byId("messages").innerHTML = (model.messages || []).slice(-5).map((message) => '<div class="item"><strong>' + message.channel + '</strong><div>' + message.text + '</div></div>').join("") || '<div class="muted">Aucun message</div>';
      byId("pendingResolutions").innerHTML = (model.pendingResolutions || []).map((resolution) => renderPendingResolution(model, resolution)).join("") || '<div class="muted">Rien a traiter</div>';
      byId("actions").innerHTML = (model.availableActions || []).filter((action) => action.available).map((action) => renderActionCard(model, action)).join("") || '<div class="muted">Aucune action disponible dans cette phase</div>';
    }
    async function playSoundCue(url) {
      const audio = new Audio(url);
      await audio.play();
    }
    byId("loadSession").addEventListener("click", () => run(loadSession));
    byId("join").addEventListener("click", () => run(async () => {
      await loadSession();
      const payload = { name: byId("name").value.trim() };
      const result = await api("/sessions/" + sessionCode + "/join", { method: "POST", body: JSON.stringify(payload) });
      deviceId = result.device.id;
      sessionCode = result.sessionCode;
      localStorage.setItem("ludovive.deviceId", deviceId);
      localStorage.setItem("ludovive.sessionCode", sessionCode);
      connectLive(sessionCode, deviceId);
      render(result.readModel);
    }));
    byId("actions").addEventListener("click", (event) => run(async () => {
      const pushButton = event.target.closest(".pushResource");
      if (pushButton) {
        const card = pushButton.closest(".actionCard");
        updateResourcePush(card, pushButton.dataset.resourcePush, Number(pushButton.dataset.step || 1));
        return;
      }
      const button = event.target.closest(".actionButton");
      if (!button) return;
      const card = button.closest(".item");
      await api("/sessions/" + sessionCode + "/events", { method: "POST", body: JSON.stringify({
        type: "action.triggered",
        sourceDeviceId: deviceId,
        actionId: button.dataset.actionId,
        payload: collectActionPayload(card)
      }) });
      await refreshDevice();
    }));
    byId("themeStrip").addEventListener("click", (event) => run(async () => {
      const button = event.target.closest("[data-sound-url]");
      if (!button) return;
      await playSoundCue(button.dataset.soundUrl);
    }));
    byId("leave").addEventListener("click", () => {
      forgetDevice();
      location.reload();
    });
    document.querySelectorAll("[data-player-tab]").forEach((button) => {
      button.addEventListener("click", () => setPlayerTab(button.dataset.playerTab));
    });
    if (switchingSession) {
      forgetDevice();
    }
    if (sessionCode) byId("code").value = sessionCode;
    if (urlCode && !deviceId) {
      loadSession().catch((error) => setError(error.message));
    }
    if (sessionCode && deviceId) {
      connectLive(sessionCode, deviceId);
      api("/sessions/" + sessionCode + "/devices/" + deviceId + "/heartbeat", { method: "POST", body: JSON.stringify({}) })
        .then((result) => render(result.readModel))
        .catch((error) => resetToJoin("Appareil a reconnecter: " + error.message));
    }
  </script>
</body>
</html>`;
}

await loadModules();
await loadPersistedSessions();

app.get("/assets/*", async (request, reply) => {
  const params = request.params as { "*": string };
  const relativePath = (params["*"] || "").replace(/\\/g, "/");
  const root = assetsDir();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep)) {
    return reply.code(404).send({ error: "Asset not found" });
  }
  try {
    const content = await readFile(resolved);
    const extension = path.extname(resolved).toLowerCase();
    const contentType = extension === ".svg" ? "image/svg+xml" : extension === ".wav" ? "audio/wav" : "application/octet-stream";
    return reply.type(contentType).send(content);
  } catch {
    return reply.code(404).send({ error: "Asset not found" });
  }
});

app.get("/", async (_request, reply) => reply.type("text/html").send(renderIndex()));
app.get("/play", async (_request, reply) => reply.type("text/html").send(renderParticipantApp()));
app.get("/health", async () => ({
  ok: true,
  service: "ludovive-server",
  uptimeSeconds: Math.round(process.uptime()),
  sessions: sessions.size,
  liveClientSessions: liveClients.size
}));
app.get("/network", async () => networkReadModel());

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
    sessionRoles: module.sessionRoles.length,
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

app.post("/demo/putsch-lite", async (_request, reply) => {
  const session = createPutschDemoSession();
  return reply.code(201).send(dashboardReadModel(session));
});

app.post("/sessions", async (request, reply) => {
  const input = createSessionSchema.parse(request.body);
  const module = modules.get(input.moduleId);
  if (!module) {
    return reply.code(400).send({ error: "Unknown module" });
  }

  const session = createSessionInstance(module);
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
  if (!hasInjectionAuthority(session)) {
    return reply.code(403).send({ error: "Injection authority is required for resolving this session" });
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
  if (!hasInjectionAuthority(session)) {
    return reply.code(403).send({ error: "Injection authority is required for drawing components" });
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

app.post("/sessions/:code/session-roles/:sessionRoleId", async (request, reply) => {
  const { code, sessionRoleId } = request.params as { code: string; sessionRoleId: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const module = getModuleOrThrow(session.moduleId);
  const input = assignSessionRoleSchema.parse(request.body);
  const sessionRole = module.sessionRoles.find((candidate) => candidate.id === sessionRoleId);
  if (!sessionRole) {
    return reply.code(400).send({ error: "Unknown session role" });
  }
  if (!input.enabled && !sessionRole.optional) {
    return reply.code(400).send({ error: "Required session role cannot be disabled" });
  }
  if (input.participantId && !session.participants.some((participant) => participant.id === input.participantId)) {
    return reply.code(404).send({ error: "Participant not found" });
  }

  try {
    assertSessionRoleAssignment(module, session, sessionRoleId, input.enabled ? input.participantId : undefined);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid session role assignment" });
  }

  const assignment: SessionRoleAssignment = {
    sessionRoleId,
    participantId: input.enabled ? input.participantId : undefined,
    enabled: input.enabled,
    assignedAt: new Date().toISOString()
  };
  session.sessionRoleAssignments[sessionRoleId] = assignment;
  audit(session, "session_role.assigned", assignment);
  broadcast(session, "session_role.assigned", assignment);
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
  if (!hasInjectionAuthority(session)) {
    return reply.code(403).send({ error: "Injection authority is required for changing resources" });
  }
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

app.post("/sessions/:code/state", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = getSession(code);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  if (!hasInjectionAuthority(session)) {
    return reply.code(403).send({ error: "Injection authority is required for session state changes" });
  }

  const input = setSessionStateSchema.parse(request.body);
  const before = session.statuses[input.state];
  session.statuses[input.state] = input.value;
  const state = { state: input.state, before, after: input.value };
  audit(session, "session.state_set", state);
  broadcast(session, "session.state_set", session.audit.at(-1));
  return {
    accepted: true,
    state,
    dashboard: dashboardReadModel(session)
  };
});
