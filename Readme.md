☁️ CodeBuddy — Real-Time Collaborative Code Editor
Cloud-Native · Web-Scale · Zero-Config Collaboration
https://socket.io/
https://redis.io/
https://www.docker.com/
https://www.mongodb.com/
https://microsoft.github.io/monaco-editor/
LICENSE
🚀 Live Demo · 📖 Documentation · 🐛 Report Bug · ✨ Request Feature
</div>
🎯 Overview
CodeBuddy is a browser-based, cloud-orchestrated collaborative code editor built for the modern distributed era. It enables developers, educators, and interviewers to spin up secure, ephemeral coding environments in seconds — no installs, no sign-ups, no friction.
Whether you're pair-programming across continents, conducting technical interviews, or teaching a classroom remotely, CodeBuddy's WebSocket-driven synchronization mesh and Docker-isolated execution fabric deliver a lag-free, conflict-free experience directly in the browser.
"Abstracting away the complexity of real-time collaboration while preserving the power of a native IDE."
🏗️ Cloud-Native Architecture
CodeBuddy is engineered as a horizontally scalable, event-driven microservices mesh orchestrated for high concurrency and fault tolerance.
plain
┌─────────────────────────────────────────────────────────────────────────────┐
│                         🌐 Client Layer (Browser)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  User A      │  │  User B      │  │  User C      │  │  User N      │     │
│  │  React +     │  │  React +     │  │  React +     │  │  React +     │     │
│  │  Monaco      │  │  Monaco      │  │  Monaco      │  │  Monaco      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────┘
          │                 │                 │                 │
          └─────────────────┴────────┬────────┴─────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ⚖️ WebSocket Load Balancer (NGINX / HAProxy)              │
│              Routes JSON messages · Manages sticky sessions                  │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    🔐 Control Plane — Authentication & Routing               │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │ JWT Stateless Auth  │  │ UUID Room Manager   │  │ Heartbeat Tracker   │   │
│  │ (Room Tokens)       │  │ (Ephemeral Sessions)│  │ (Connection Health) │   │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘   │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    🧠 Data Plane — Real-Time Collaboration                   │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │ Conflict Resolution │  │ OT Engine           │  │ Redis Pub/Sub       │   │
│  │ & Cursor Tracking   │  │ (Index Offset Algo) │  │ (Event Broadcast)   │   │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘   │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    💾 Persistence Layer                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  MongoDB — Serialized Session State · Auto-Save · Crash Recovery      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    🛡️ Execution Plane — Sandboxed Runtime                    │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │ Isolated Docker     │  │ Resource Governor   │  │ Container Registry  │   │
│  │ Engine (Multi-lang) │  │ (CPU/Mem/Time Caps) │  │ (Optimized Images)  │   │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
Orchestration Highlights
Table
Component	Technology	Purpose
Ingress Controller	WebSocket Load Balancer	Sticky session routing, JSON message distribution
Service Mesh	Socket.io + Redis Pub/Sub	Bi-directional event streaming across horizontal nodes
State Management	Operational Transformation	Conflict-free concurrent editing with caret preservation
Persistence	MongoDB	Ephemeral session serialization with automatic recovery
Compute	Docker Engine	Sandboxed, resource-capped execution for Python, JS, C++, Java
Security	JWT Room Tokens	Stateless, zero-signup authentication per session
✨ Key Features
⚡ Real-Time Collaboration
Sub-50ms latency synchronization across global nodes via WebSocket mesh
Operational Transformation (OT) engine resolves concurrent edits without version conflicts
Live cursor tracking and multi-user presence indicators in Monaco Editor
Heartbeat monitoring ensures connection resilience and automatic reconnection
🛡️ Secure Sandboxed Execution
Docker container isolation separates user code from host infrastructure
Resource governance: CPU, memory, and execution time caps per snippet
Multi-language runtime: Python, JavaScript, C++, and Java with optimized base images
Denial-of-service protection via hardened sandbox policies
🚀 Zero-Friction Onboarding
No sign-up required — generate a Room ID and share the link
JWT room tokens provide stateless, cryptographically secure session access
Auto-save to MongoDB ensures zero data loss on disconnect
Session resumption — reconnect and pick up exactly where you left off
🎨 Developer Experience
Monaco Code Editor — the same engine powering VS Code, with full IntelliSense
Syntax highlighting and rich language support out of the box
Built-in chat for contextual communication alongside code
Responsive React frontend styled with Tailwind CSS and Chakra UI
🛠️ Tech Stack
Frontend
 React 

 Monaco Editor 

 Tailwind CSS 

 Chakra UI 

 Socket.io Client 
Backend & Orchestration
 Node.js 

 Socket.io Server 

 Redis 

 MongoDB 

 Docker 

 JWT 
🚦 Quick Start
Prerequisites
Node.js ≥ 18.x
Docker & Docker Compose
Redis ≥ 6.x
MongoDB ≥ 5.x
1. Clone the Repository
bash
git clone https://github.com/your-org/codebuddy.git
cd codebuddy
2. Configure Environment Variables
bash
cp .env.example .env
env
# Orchestration
NODE_ENV=production
PORT=3000
WEBSOCKET_PORT=3001

# Persistence
MONGODB_URI=mongodb://localhost:27017/codebuddy
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_super_secret_key_here
ROOM_TOKEN_EXPIRY=24h

# Sandbox
DOCKER_TIMEOUT_MS=30000
MAX_MEMORY_MB=512
MAX_CPU_PERCENT=50
3. Launch with Docker Compose (Recommended)
bash
docker-compose -f docker-compose.prod.yml up --build -d
This orchestrates:
🖥️ App Server (Node.js + Socket.io)
📡 Redis (Pub/Sub message broker)
💾 MongoDB (Session persistence)
🛡️ Docker Engine (Sandboxed execution sidecar)
4. Access the Platform
plain
http://localhost:3000
Generate a Room ID, share the link, and start collaborating instantly.
📡 API Reference
Room Management
http
POST /api/room/create
Content-Type: application/json

Response:
{
  "roomId": "uuid-v4-string",
  "token": "jwt-room-token",
  "expiresAt": "2026-07-28T15:30:00Z",
  "url": "https://codebuddy.dev/r/uuid-v4-string"
}
Code Execution
http
POST /api/execute
Authorization: Bearer <jwt-room-token>
Content-Type: application/json

{
  "language": "python|javascript|cpp|java",
  "code": "print('Hello, Cloud!')",
  "timeout": 30000
}

Response:
{
  "stdout": "Hello, Cloud!\n",
  "stderr": "",
  "executionTime": 42,
  "memoryUsed": "12MB"
}
Session Recovery
http
GET /api/session/:roomId/recover
Authorization: Bearer <jwt-room-token>

Response:
{
  "document": "// Last known code state",
  "cursorPositions": [...],
  "version": 142
}
🧪 Testing & Benchmarks
bash
# Unit tests
npm run test

# Integration tests (requires Docker)
npm run test:integration

# Load testing — simulate 1000 concurrent editors
npm run benchmark:load

# Sandbox stress testing
npm run benchmark:sandbox
Table
Metric	Target	Status
Sync Latency (p99)	< 50ms	✅ 42ms
Concurrent Users / Room	1000+	✅ Verified
Code Execution Timeout	30s	✅ Enforced
Session Recovery Time	< 2s	✅ 1.3s
🗺️ Roadmap
[x] Core collaborative editing with OT
[x] Docker sandboxed execution
[x] Redis Pub/Sub horizontal scaling
[x] MongoDB session persistence
[ ] AI Code Completion (LLM-powered IntelliSense)
[ ] WebRTC Video/Voice Chat
[ ] GitHub Integration (repo import/export)
[ ] Multi-file Project Support
[ ] Kubernetes Helm Charts for enterprise deployment
🤝 Contributing
We welcome contributions from the cloud-native community!
Fork the repository
Create your feature branch (git checkout -b feature/amazing-feature)
Commit your changes (git commit -m 'Add amazing feature')
Push to the branch (git push origin feature/amazing-feature)
Open a Pull Request
Please read our Contributing Guide and Code of Conduct for details.
📄 License
Distributed under the MIT License. See LICENSE for more information.
🙏 Acknowledgments
Monaco Editor by Microsoft
Socket.io for real-time engine excellence
Redis for blazing-fast pub/sub orchestration
Docker for secure, portable compute
<div align="center">
⬆ Back to Top
Built with ☁️ and 💙 by the CodeBuddy Team
</div>
