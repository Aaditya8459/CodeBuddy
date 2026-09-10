CodeBuddy — Start After System Reboot
1. Start Docker Desktop

After restarting Windows:

Open Docker Desktop.
Wait until Docker Desktop shows that Docker is running.
Open PowerShell.

Verify Docker:

docker version

You should see both Client and Server sections.

2. Go to the CodeBuddy project
cd C:\Users\aadit\Downloads\New

Verify:

dir

You should have:

client
server
worker-service
docker-compose.yml
3. Start all CodeBuddy containers

Run:

docker compose up -d

This starts:

new-client-1
new-server-1
new-worker-1
4. Check container status

Run:

docker compose ps

You want all three containers to show:

Up

For example:

NAME           STATUS
new-client-1   Up
new-server-1   Up
new-worker-1   Up
5. Verify Worker Docker access

This is important because your worker executes programs by creating additional Docker containers.

Run:

docker exec new-worker-1 printenv DOCKER_SOCKET

Expected:

/var/run/docker.sock

Then:

docker exec new-worker-1 ls -l /var/run/docker.sock

Expected:

srw-rw---- ... /var/run/docker.sock

If both work, your Worker → Docker Engine connection is ready.

6. Check Server

Run:

docker compose logs --tail=50 server

You should see something similar to:

🚀 Starting CodeBuddy Server...
✅ MongoDB Connected Successfully
🚀 Server: http://localhost:5000
🌐 Client: http://localhost:3000
7. Check Worker

Run:

docker compose logs --tail=50 worker

You should see:

==========================================
        CODEBUDDY WORKER SERVICE
==========================================

🚀 Worker:     http://localhost:5001
❤️  Health:    http://localhost:5001/health
▶️  Execute:   http://localhost:5001/internal/execute
8. Open CodeBuddy

Open your browser:

http://localhost:3000

Your architecture is:

                 ┌─────────────────┐
                 │     Browser     │
                 │ localhost:3000  │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │     Client      │
                 │    Next.js      │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │     Server      │
                 │ localhost:5000  │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │     Worker      │
                 │   port 5001     │
                 └────────┬────────┘
                          │
                   docker.sock
                          │
                          ▼
                 ┌─────────────────┐
                 │  Docker Engine  │
                 └────────┬────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          Python       Node.js       GCC
          Java         Go            Rust
          TypeScript
9. Test code execution

In CodeBuddy, select Python and run:

print("Hello CodeBuddy")

Expected:

Hello CodeBuddy

Then test:

print(8 + 5)

Expected:

13

There should be no  characters after the executor.ts change.

10. Test all 8 languages

You can quickly test each language with the Hello World programs:

Python
print("Hello World")
JavaScript
console.log("Hello World");
TypeScript
console.log("Hello World");
C
#include <stdio.h>

int main() {
    printf("Hello World\n");
    return 0;
}
C++
#include <iostream>

int main() {
    std::cout << "Hello World" << std::endl;
    return 0;
}
Java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
Go
package main

import "fmt"

func main() {
    fmt.Println("Hello World")
}
Rust
fn main() {
    println!("Hello World");
}
Important: Don't rebuild unnecessarily

After a normal Windows reboot, do not run:

docker compose build

unless you changed the source code/Dockerfile or the image needs rebuilding.

Normally this is enough:

cd C:\Users\aadit\Downloads\New
docker compose up -d
docker compose ps

Then open:

http://localhost:3000
If something doesn't work
Containers aren't running
docker compose up -d
Server problem
docker compose logs --tail=100 server
Worker problem
docker compose logs --tail=100 worker
Check Docker socket
docker exec new-worker-1 ls -l /var/run/docker.sock
Restart only worker
docker compose restart worker
Restart entire CodeBuddy stack
docker compose restart
Complete reset/recreate

Only if necessary:

docker compose down
docker compose up -d
⭐ Your normal post-reboot routine

You can save this as your standard routine:

cd C:\Users\aadit\Downloads\New

docker version

docker compose up -d

docker compose ps

docker exec new-worker-1 printenv DOCKER_SOCKET

docker exec new-worker-1 ls -l /var/run/docker.sock

If everything is healthy:

Docker ✅
Client ✅
Server ✅
Worker ✅
Docker Socket ✅

Then open http://localhost:3000 and use CodeBuddy.