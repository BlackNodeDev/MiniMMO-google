/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

// Express serves the public client directory.
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to route back to client index in case of page-level refreshes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure base HTTP Server
const server = http.createServer(app);

// Integrate WebSocket Server linked securely onto the same port 3000
const wss = new WebSocketServer({ server });

/**
 * --- MULTIPLAYER IN-MEMORY ROOM STORAGE ---
 * Keeps track of connected players and placed blocks for this v0.1 sandbox prototype.
 * Easily interchangeable with Firebase Realtime Database or Supabase/PostgreSQL.
 */
const rooms = {
  home: {
    players: new Map(), // map player ID -> player info object
    objects: [
      // Starter objects to ensure the scene has initial objects even if client cache is empty
      { id: 'white_slab_1', type: 'block', position: [-6.6, 0.45, -5.4], size: [4.4, 0.9, 1.8], material: 'white' },
      { id: 'graphite_cube_1', type: 'block', position: [5.2, 0.7, -2.2], size: [1.8, 1.4, 1.8], material: 'graphite' },
      { id: 'cyan_platform_1', type: 'block', position: [-0.8, 0.24, 5.2], size: [4.0, 0.48, 3.4], material: 'cyanGlass' },
      { id: 'silver_bench_1', type: 'block', position: [7.6, 0.32, 5.8], size: [3.2, 0.64, 1.4], material: 'silver' }
    ]
  }
};

// Maximum built block limit to prevent client CPU/memory degradation (Safety Constraint)
const MAX_OBJECTS_PER_ROOM = 120;
// Maximum boundary limit on placement coordinates (Sandbox range)
const WORKSPACE_BOUNDS = 20.0;

/**
 * Clean & sanitize text values
 */
function sanitizeText(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLength).replace(/[<>]/g, '');
}

// Broadcaster helper to distribute event to everyone in a specific room (excluding sender optionally)
function broadcastToRoom(roomId, jsonPayload, excludeWs = null) {
  const room = rooms[roomId];
  if (!room) return;
  const messageStr = JSON.stringify(jsonPayload);

  room.players.forEach((player, wsKey) => {
    if (wsKey !== excludeWs && wsKey.readyState === WebSocket.OPEN) {
      wsKey.send(messageStr);
    }
  });
}

wss.on('connection', (ws) => {
  // Store connected client attributes
  let playerSession = null;
  let currentRoomId = 'home';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const action = data.type;

      switch (action) {
        case 'join': {
          // Parse connection parameters safely
          const id = sanitizeText(data.id, 64) || 'p_' + Math.random().toString(36).substring(2, 9);
          const name = sanitizeText(data.name, 16) || 'Guest Llama';
          const skin = sanitizeText(data.skin, 24) || 'llama';
          const defaultSpawn = { x: 0, y: 0.1, z: 0, yaw: Math.PI };

          playerSession = {
            id,
            name,
            skin,
            x: typeof data.x === 'number' ? data.x : defaultSpawn.x,
            y: typeof data.y === 'number' ? data.y : defaultSpawn.y,
            z: typeof data.z === 'number' ? data.z : defaultSpawn.z,
            yaw: typeof data.yaw === 'number' ? data.yaw : defaultSpawn.yaw,
            lastSeen: Date.now()
          };

          // Register into Room
          if (!rooms[currentRoomId]) {
            rooms[currentRoomId] = { players: new Map(), objects: [] };
          }

          // Store player mapped by their unique WebSocket socket link
          rooms[currentRoomId].players.set(ws, playerSession);

          // Reply with introductory Welcome parameters
          ws.send(JSON.stringify({
            type: 'welcome',
            id: playerSession.id,
            room: currentRoomId,
            objects: rooms[currentRoomId].objects,
            systemMsg: 'Connected to core Minimmo Server'
          }));

          // Notify others in room about new animal avatar spawn
          broadcastToRoom(currentRoomId, {
            type: 'system',
            message: `${playerSession.name} has entered Minimmo Home.`
          }, ws);

          break;
        }

        case 'playerState': {
          if (!playerSession) return;
          // Fluid state tracking update: speeds and coordinates are validated
          playerSession.x = Math.max(-WORKSPACE_BOUNDS, Math.min(WORKSPACE_BOUNDS, Number(data.x) || 0));
          playerSession.y = Math.max(-2, Math.min(10, Number(data.y) || 0));
          playerSession.z = Math.max(-WORKSPACE_BOUNDS, Math.min(WORKSPACE_BOUNDS, Number(data.z) || 0));
          playerSession.yaw = Number(data.yaw) || 0;
          playerSession.lastSeen = Date.now();
          break;
        }

        case 'chat': {
          if (!playerSession) return;
          // Apply strict message filters: trim length to maximum of 160 characters
          const chatMsg = sanitizeText(data.text, 160);
          if (!chatMsg) return;

          // Broadcast the message globally with safe sanitization checks
          broadcastToRoom(currentRoomId, {
            type: 'chat',
            id: playerSession.id,
            name: playerSession.name,
            text: chatMsg
          });
          break;
        }

        case 'placeObject': {
          if (!playerSession) return;
          const room = rooms[currentRoomId];
          if (!room) return;

          // Prevent spamming builds by restricting room objects size
          if (room.objects.length >= MAX_OBJECTS_PER_ROOM) {
            ws.send(JSON.stringify({
              type: 'system',
              error: 'Max sandbox load achieved for this private space (120 blocks max).'
            }));
            return;
          }

          // Extract coordinates and validate
          const objId = sanitizeText(data.id, 64) || 'obj_' + Math.random().toString(36).substring(2, 9);
          const objType = sanitizeText(data.objType, 24) || 'block';
          const material = sanitizeText(data.material, 24) || 'white';
          const px = Number(data.position?.[0]) || 0;
          const py = Number(data.position?.[1]) || 0;
          const pz = Number(data.position?.[2]) || 0;

          // Spatial clamping
          if (Math.abs(px) > WORKSPACE_BOUNDS || Math.abs(pz) > WORKSPACE_BOUNDS) return;

          const newObj = {
            id: objId,
            type: objType,
            position: [px, py, pz],
            size: data.size || [1, 1, 1],
            material: material
          };

          // Append to in-memory scene
          room.objects.push(newObj);

          // TODO PERSISTENCE LINK:
          // Insert database record writes here (e.g. Firebase Firestore update)
          // db.collection('worlds').doc(currentRoomId).update({ objects: arrayUnion(newObj) })

          // Communicate object arrival to keep remote world clients synced
          broadcastToRoom(currentRoomId, {
            type: 'objectAdded',
            object: newObj
          });
          break;
        }

        case 'removeObject': {
          if (!playerSession) return;
          const room = rooms[currentRoomId];
          if (!room) return;

          const targetId = sanitizeText(data.id, 64);
          if (!targetId) return;

          const index = room.objects.findIndex(o => o.id === targetId);
          if (index !== -1) {
            room.objects.splice(index, 1);

            // TODO PERSISTENCE LINK:
            // Delete database record or remove array element here

            broadcastToRoom(currentRoomId, {
              type: 'objectRemoved',
              id: targetId
            });
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.warn('Malformed payload received in multiplayer server socket:', err);
    }
  });

  // Client connection teardown handler
  ws.on('close', () => {
    const room = rooms[currentRoomId];
    if (room && playerSession) {
      room.players.delete(ws);
      // Let everyone know they left
      broadcastToRoom(currentRoomId, {
        type: 'system',
        message: `${playerSession.name} has left Minimmo Home.`
      });
    }
  });
});

/**
 * --- MULTIPLAYER COMPRESSION SNAPSHOT LOOP ---
 * Broadcast compressed player snapshots containing coordinates, skins, and alignments at 20Hz.
 */
setInterval(() => {
  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.size === 0) return;

    const snapshot = {
      type: 'snapshot',
      players: []
    };

    room.players.forEach((player) => {
      // Feed snapshot values (id, user name, coordinates, skin vector status)
      snapshot.players.push({
        id: player.id,
        name: player.name,
        skin: player.skin,
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw
      });
    });

    const compactMsg = JSON.stringify(snapshot);
    room.players.forEach((playerObj, wsKey) => {
      if (wsKey.readyState === WebSocket.OPEN) {
        wsKey.send(compactMsg);
      }
    });
  });
}, 50); // 20 frames per second network resolution

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Minimmo Home Online dev-server listening on port ${PORT}`);
});
