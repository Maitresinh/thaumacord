import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";

const app = Fastify({ logger: true });
await app.register(websocket);

type Player = {
  id: string;
  name: string;
};

type Session = {
  code: string;
  moduleId: string;
  phase: string;
  players: Player[];
  audit: Array<{ at: string; type: string; payload: unknown }>;
};

const sessions = new Map<string, Session>();

const createSessionSchema = z.object({
  moduleId: z.string().min(1)
});

const joinSessionSchema = z.object({
  name: z.string().min(1).max(80)
});

function makeCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function audit(session: Session, type: string, payload: unknown): void {
  session.audit.push({ at: new Date().toISOString(), type, payload });
}

app.get("/health", async () => ({ ok: true, service: "thaumacord-server" }));

app.post("/sessions", async (request, reply) => {
  const input = createSessionSchema.parse(request.body);
  const code = makeCode();
  const session: Session = {
    code,
    moduleId: input.moduleId,
    phase: "setup",
    players: [],
    audit: []
  };
  audit(session, "session.created", { moduleId: input.moduleId });
  sessions.set(code, session);
  return reply.code(201).send(session);
});

app.get("/sessions/:code", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = sessions.get(code.toUpperCase());
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  return session;
});

app.post("/sessions/:code/join", async (request, reply) => {
  const { code } = request.params as { code: string };
  const session = sessions.get(code.toUpperCase());
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }

  const input = joinSessionSchema.parse(request.body);
  const player: Player = {
    id: crypto.randomUUID(),
    name: input.name
  };

  session.players.push(player);
  audit(session, "player.joined", { playerId: player.id, name: player.name });
  return reply.code(201).send({ player, sessionCode: session.code });
});

app.listen({ port: Number(process.env.PORT ?? 3333), host: "0.0.0.0" });

