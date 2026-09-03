import bedrock from "bedrock-protocol";
import config from "./config.json" with { type: "json" };

const host = process.env.MC_HOST || config.client.host;
const port = Number(process.env.MC_PORT || config.client.port);
const username = process.env.BOT_USERNAME || config.client.username;
const offline = (process.env.BEDROCK_OFFLINE ?? String(config.client.offline)).toLowerCase() === "true";
const moveInterval = Number(process.env.MOVE_INTERVAL || config.action.moveInterval);
const moveDuration = Number(process.env.MOVE_DURATION || config.action.moveDuration);
const retryDelay = Number(process.env.RETRY_DELAY || config.action.retryDelay);

let client = null;
let movementTimer = null;
let directionTimer = null;
let reconnectTimer = null;
let tick = 0n;
let position = { x: 0, y: 64, z: 0 };
let yaw = 0;
let pitch = 0;
let runtimeId = null;
let connected = false;
let moving = false;

function stopMovement() {
  if (movementTimer) clearInterval(movementTimer);
  if (directionTimer) clearInterval(directionTimer);
  movementTimer = null;
  directionTimer = null;
  moving = false;
}

function queueLoadingPackets() {
  if (!client || runtimeId === null) return;
  try {
    client.queue("serverbound_loading_screen", { type: 1 });
    client.queue("serverbound_loading_screen", { type: 2 });
    client.queue("set_local_player_as_initialized", { runtime_entity_id: BigInt(runtimeId) });
  } catch (error) {
    console.error("Initialization packet error:", error?.message || error);
  }
}

function sendMovement() {
  if (!client || !connected || runtimeId === null) return;
  const radians = (yaw * Math.PI) / 180;
  const amount = moving ? 0.4 : 0;
  const moveVector = {
    x: Math.sin(radians) * amount,
    z: Math.cos(radians) * amount
  };

  try {
    client.queue("player_auth_input", {
      pitch,
      yaw,
      head_yaw: yaw,
      position,
      move_vector: moveVector,
      input_data: { _value: 0n, up: moving },
      input_mode: "touch",
      play_mode: 0,
      interaction_model: 1,
      interact_rotation: { x: 0, z: yaw },
      tick: tick++,
      delta: { x: 0, y: 0, z: 0 },
      analogue_move_vector: moveVector,
      camera_orientation: { x: 0, y: 0, z: 0 },
      raw_move_vector: moveVector
    });
  } catch (error) {
    console.error("Movement packet error:", error?.message || error);
  }
}

function startMovement() {
  stopMovement();
  moving = true;
  movementTimer = setInterval(sendMovement, moveInterval);
  directionTimer = setInterval(() => {
    if (!connected) return;
    yaw = (yaw + 90) % 360;
    moving = !moving;
    setTimeout(() => { if (connected) moving = true; }, Math.min(moveDuration, 2000));
  }, moveDuration);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, retryDelay);
}

function createBot() {
  stopMovement();
  connected = false;
  runtimeId = null;
  tick = 0n;

  console.log(`Connecting to ${host}:${port} as ${username} (Bedrock ${config.client.minecraftVersion})...`);

  try {
    client = bedrock.createClient({ host, port, username, offline });

    client.on("start_game", (packet) => {
      runtimeId = packet.runtime_entity_id;
      if (packet.player_position) position = packet.player_position;
      console.log("Start game received.");
      queueLoadingPackets();
    });

    client.on("move_player", (packet) => {
      if (runtimeId !== null && BigInt(packet.runtime_entity_id) === BigInt(runtimeId)) {
        position = packet.position;
        pitch = Number(packet.pitch ?? pitch);
        yaw = Number(packet.yaw ?? yaw);
      }
    });

    client.on("play_status", (packet) => {
      console.log(`Play status: ${packet.status}`);
      if (String(packet.status).toLowerCase().includes("player_spawn")) {
        connected = true;
        startMovement();
      }
    });

    client.on("join", () => {
      connected = true;
      console.log("Bot joined the Bedrock server.");
      startMovement();
    });

    client.on("spawn", () => {
      connected = true;
      console.log("Bot spawned.");
      startMovement();
    });

    client.on("disconnect", (packet) => {
      connected = false;
      stopMovement();
      console.error("Bot disconnected:", packet?.message ?? packet ?? "unknown reason");
      scheduleReconnect();
    });

    client.on("error", (error) => {
      console.error("Bedrock bot error:", error?.message || error);
    });
  } catch (error) {
    console.error("Could not create Bedrock client:", error?.message || error);
    scheduleReconnect();
  }
}

export function startBot() {
  console.log(`Offline mode: ${offline ? "enabled" : "disabled"}`);
  createBot();
}
