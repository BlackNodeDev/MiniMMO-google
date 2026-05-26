# 🦙 Minimmo Home Online (v0.1 Prototype)

Minimmo is a clean, Apple-inspired, mobile-first social sandbox MMO platform. Cute animal avatars spawn into custom personal environments where they can build and shape their surroundings, chat, invite friends, explore other players' homes, and gather together in real-time.

---

## 🎨 Visual Identity & Feeling

- **Aesthetic**: Translucent glass interfaces, high positive whitespace, custom circular 24px control buttons, and clean pastel tone structures. 
- **Cute 3D Toy World**: High-contrast ambient elements, low-poly geometries constructed directly from shared parts, soft soft-shadow lighting, and simple ground grids (Japanese minimalism meets Apple's hardware studio).
- **Zero Port Larping / Clutter**: No simulated console terminals, network ping overlays, or noisy tech metadata. The outer viewport is completely clean.

---

## 🏗️ Technical Stack

- **Backend Network**: Node.js & Express connected to a lightweight, real-time WebSocket (`ws`) layer serving in-memory rooms and player lists.
- **Frontend Engine**: Pure vanilla JavaScript (HTML5/ES Modules) + custom low-poly shaders built using **Three.js** via secure importmap CDNs (optimized for instant mobile load times).
- **Persistence Layer**: Local-first fallback system (rebuilt instantly from `localStorage` backups if connection drops).

---

## 📂 Project Organization

```text
├── package.json               # Package descriptors, simplified scripts & dependencies
├── server.js                  # Node/Express HTTP platform with integrated WebSocket snapshot layers
├── metadata.json              # Applet metadata descriptor
└── public/
    ├── index.html             # Responsive viewport, brand indicators, and HUD tabs
    ├── app.js                 # Unified 3D client sandbox engine, animals manager, and inputs
    ├── styles.css             # Apple-clean glassy panel layout specifications
    └── worlds/
        └── home.json          # Default material properties and world spawn configurations
```

---

## ⚙️ Quick Start Installation

### Step 1: Install Dependencies
Download and map package descriptors:
```bash
npm install
```

### Step 2: Boot Services
To boot the Express page server and trigger WebSocket connection listeners:
```bash
npm start
```
*The local server automatically binds onto Port `3000`.*

---

## 📱 Devices Testing Guide

### 1. Test on PC/Mac
Open your desktop browser, navigate to:
```text
http://localhost:3000
```
- Move around using keys: **W A S D** or **Arrow Keys**.
- Click the **Create** tab in the bottom panel to select blocks. Click the ground to build blocks, or click placed blocks to erase them.
- Hover states and tactile drag support are fully active.

### 2. Test Multi-Device Social Multiplayer
To connect other devices (such as a phone or tablet) on your same local Wi-Fi router:
1. Locate your PC's IP address on the network (e.g., `192.168.1.45`).
2. Type the following URL into your phone's browser (Safari/Chrome):
```text
http://YOUR_PC_IP_ADDRESS:3000
```
3. Move fingers on the virtual left **Joystick** pad to control movement on mobile screens. Tap the material bubbles inside **Create** to switch blocks.

---

## 🗺️ Extended Platform Roadmap

### Phase 1: Local-First Core (Current)
- In-memory WebSocket multi-room managers.
- Local character skin selectors (Llama, Whale, Panda, Owl, Frog).
- Smooth character controller collisions with physical sliding.
- Automatic socket fallback reconnect loops.

### Phase 2: Cloud Sync & Accounts
- Firebase Firestore/Supabase schema maps to preserve modified blocks permanently.
- Auth controllers to bind unique usernames to player profiles.
- **Discover** explorer page showing public directory logs of homes online right now.

### Phase 3: Authoritative MMO Backend
- Transform gameplay logic to an authoritative hub server structure (such as Colyseus or Nakama).
- Social friend networks, chat lobbies, guild parties, and larger shared MMO persistent lands.

### Phase 4: Creative AI Builder
- Bind Gemini API prompts to procedural sandbox code generations.
- Allow animals to shape brand new structures, custom skins, or audio clips.
